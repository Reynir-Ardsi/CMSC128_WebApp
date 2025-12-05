require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// --- EXPRESS & CORS SETUP ---
const app = express();
app.use(express.json());
app.use(cors({
    origin: "*", // allow all origins or configure specific frontend URL
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// --- MONGODB CONNECTION MANAGEMENT ---
const mongoURI = process.env.Server_Connection_Key;

// Global variable to cache the connection in serverless environment
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    const db = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000 // Avoid long hangs on connection errors
    });
    isConnected = db.connections[0].readyState;
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
    // Do not exit process in serverless, just throw error so request fails
    throw err;
  }
};

// Middleware to ensure DB connection on every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

// --- MONGOOSE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  securityQuestion: String,
  securityAnswer: String,
});

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ["personal", "collab"], default: "personal" },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

const TaskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: String,
  time: String,
  priority: { type: String, default: "Low" },
  done: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
});

const DeletedTaskSchema = new mongoose.Schema({
  taskData: Object,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  expiresAt: { type: Date, default: () => Date.now() + 10 * 60 * 1000, index: { expires: "10m" } },
});

// Prevent model overwrite error in serverless hot-reloads
const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Group = mongoose.models.Group || mongoose.model("Group", GroupSchema);
const Task = mongoose.models.Task || mongoose.model("Task", TaskSchema);
const DeletedTask = mongoose.models.DeletedTask || mongoose.model("DeletedTask", DeletedTaskSchema);

// --- MIDDLEWARE ---
const isAuthenticated = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, process.env.JWT_SECRET || "your-default-secret", (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.userId = decoded.userId;
    next();
  });
};

// ================================
//       AUTH ROUTES
// ================================

app.post("/auth/register", async (req, res) => {
    try {
        const { name, email, password, securityQuestion, securityAnswer } = req.body;

        if (!name || !email || !password || !securityQuestion || !securityAnswer) {
            return res.status(400).json({ error: "All fields are required" });
        }
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: "Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedAnswer = await bcrypt.hash(securityAnswer, 10);

        const user = new User({ 
            name, 
            email, 
            password: hashedPassword,
            securityQuestion,
            securityAnswer: hashedAnswer
        });
        
        await user.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-default-secret",
      { expiresIn: '1d' }
    );

    res.json({ message: "Login successful", token, userId: user._id, name: user.name });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/auth/forgot", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "Email not found" });
        res.json({ question: user.securityQuestion });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post("/auth/forgot/verify", async (req, res) => {
    try {
        const { email, answer } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ error: "Incorrect answer" });
        }

        const isMatch = await bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswer);

        if (!isMatch) {
            return res.status(401).json({ error: "Incorrect answer" });
        }

        const resetToken = jwt.sign(
            { userId: user._id, purpose: "reset_password" }, 
            process.env.JWT_SECRET || "secret", 
            { expiresIn: '10m' }
        );
        
        res.json({ message: "Answer correct", resetToken });
    } catch (err) { 
        console.error("Verify Error:", err);
        res.status(500).json({ error: "Server error" }); 
    }
});

app.post("/auth/forgot/reset", async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || "secret");
        if (decoded.purpose !== "reset_password") return res.status(403).json({ error: "Invalid token" });
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(decoded.userId, { password: hashedPassword });
        res.json({ message: "Password updated successfully" });
    } catch (err) { res.status(400).json({ error: "Invalid token" }); }
});

app.get("/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.put("/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const { name, email, password, securityQuestion, securityAnswer } = req.body;
    
    const updateData = { name, email };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    if (securityQuestion) {
      updateData.securityQuestion = securityQuestion;
    }

    if (securityAnswer) {
      updateData.securityAnswer = await bcrypt.hash(securityAnswer, 10);
    }

    const user = await User.findByIdAndUpdate(req.userId, updateData, {
      new: true,
    }).select("-password -securityAnswer"); 

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Account updated successfully", user });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(400).json({ error: "Failed to update account" });
  }
});

// --- DATA ROUTES (Groups/Tasks) ---
const apiRouter = express.Router();
app.use("/api", isAuthenticated, apiRouter);

apiRouter.get("/data", async (req, res) => {
  try {
    const userId = req.userId;
    const userGroups = await Group.find({ $or: [{ owner: userId }, { collaborators: userId }] })
        .populate('collaborators', 'name email')
        .populate('owner', 'name email');
    
    const groupIds = userGroups.map((g) => g._id);
    const userTasks = await Task.find({ $or: [{ owner: userId }, { group: { $in: groupIds } }] });
    
    const cleanGroups = userGroups.map(d => ({ ...d.toObject(), id: d._id }));
    const cleanTasks = userTasks.map(d => ({ ...d.toObject(), id: d._id, group: d.group || null }));
    
    res.json({ groups: cleanGroups, tasks: cleanTasks });
  } catch (err) { res.status(500).json({ error: "Fetch error" }); }
});

apiRouter.get("/users/search", async (req, res) => {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]); 
    
    try {
        const users = await User.find({
            $or: [
                { name: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ]
        }).select("name email").limit(5);
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Search failed" }); }
});

// Group Routes
apiRouter.post("/groups", async (req, res) => {
    const { name, type } = req.body;
    const group = new Group({ name, type, owner: req.userId, collaborators: type === 'collab' ? [req.userId] : [] });
    await group.save();
    
    const populatedGroup = await Group.findById(group._id)
        .populate('owner', 'name email')
        .populate('collaborators', 'name email');

    res.status(201).json({ ...populatedGroup.toObject(), id: group._id });
});

apiRouter.put("/groups/:id", async (req, res) => {
  try {
    const { name, type } = req.body;
    const group = await Group.findOne({ _id: req.params.id, owner: req.userId });

    if (!group) {
      return res.status(404).json({ error: "Group not found or you are not the owner" });
    }

    if (name) group.name = name;
    if (type) group.type = type;

    if (type === 'personal') {
        group.collaborators = [];
    } else if (type === 'collab') {
        if (!group.collaborators.includes(req.userId)) {
            group.collaborators.push(req.userId);
        }
    }

    await group.save();
    res.json({ ...group.toObject(), id: group._id });
  } catch (err) {
    console.error("PUT /api/groups Error:", err);
    res.status(500).json({ error: "Failed to update group" });
  }
});

apiRouter.delete("/groups/:id", async (req, res) => {
    const group = await Group.findOneAndDelete({ _id: req.params.id, owner: req.userId });
    if (!group) return res.status(403).json({ error: "Not authorized" });
    await Task.updateMany({ group: req.params.id }, { group: null });
    res.json({ message: "Deleted" });
});

apiRouter.post("/groups/:id/collaborators", async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    const groupCheck = await Group.findById(req.params.id);
    if (groupCheck.owner.toString() === user._id.toString()) {
        return res.status(400).json({error: "User is already the owner"});
    }

    await Group.updateOne({ _id: req.params.id, type: "collab" }, { $addToSet: { collaborators: user._id } });
    res.json({ message: "Added" });
});

apiRouter.delete("/groups/:groupId/collaborators/:userId", async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: "Group not found" });

        const isOwner = group.owner.toString() === req.userId;
        const isSelf = req.userId === req.params.userId;

        if (!isOwner && !isSelf) {
            return res.status(403).json({ error: "Not authorized" });
        }

        group.collaborators.pull(req.params.userId);
        await group.save();
        res.json({ message: "Removed" });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

apiRouter.post("/tasks", async (req, res) => {
    const task = new Task({ ...req.body, owner: req.userId, group: req.body.groupId || null });
    await task.save();
    res.status(201).json({ ...task.toObject(), id: task._id });
});

apiRouter.put("/tasks/:id", async (req, res) => {
    const { groupId, ...rest } = req.body;
    const update = { ...rest };
    
    if (groupId !== undefined) {
        update.group = groupId || null;
    }
    
    const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json({ ...task.toObject(), id: task._id });
});

apiRouter.delete("/tasks/:id", async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (task) {
        await new DeletedTask({ taskData: task, owner: req.userId }).save();
        await Task.findByIdAndDelete(req.params.id);
    }
    res.json({ message: "Deleted" });
});

apiRouter.delete("/tasks/completed", async (req, res) => {
    await Task.deleteMany({ owner: req.userId, done: true });
    res.json({ message: "Cleared" });
});


app.get("/", (req, res) => {
    res.send("Backend is running!");
});


if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}


module.exports = app;
