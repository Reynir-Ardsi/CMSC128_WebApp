require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// --- EXPRESS & CORS SETUP ---
const app = express();
app.use(express.json());
app.use(cors());

// --- MONGODB CONNECTION ---
const mongoURI = process.env.Server_Connection_Key;
mongoose
  .connect(mongoURI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

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

const User = mongoose.model("User", UserSchema);
const Group = mongoose.model("Group", GroupSchema);
const Task = mongoose.model("Task", TaskSchema);
const DeletedTask = mongoose.model("DeletedTask", DeletedTaskSchema);

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

// 1. Register
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, question, answer } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: "Missing fields" });
    
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    // Note: In a real app, you should also hash the security answer!
    const user = new User({ 
        name, 
        email, 
        password: hashedPassword,
        securityQuestion: question, 
        securityAnswer: answer 
    });
    
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Login
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

// 3. Forgot Password - Step 1: Check Email & Get Question
app.post("/auth/forgot", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "Email not found" });
        if (!user.securityQuestion) return res.status(400).json({ error: "No security question set for this account" });

        res.json({ question: user.securityQuestion });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// 4. Forgot Password - Step 2: Verify Answer
app.post("/auth/forgot/verify", async (req, res) => {
    try {
        const { email, answer } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Simple string comparison (case-insensitive)
        if (user.securityAnswer.toLowerCase().trim() !== answer.toLowerCase().trim()) {
            return res.status(401).json({ error: "Incorrect answer" });
        }

        // Generate a short-lived "Reset Token" (valid for 10 mins)
        const resetToken = jwt.sign(
            { userId: user._id, purpose: "reset_password" },
            process.env.JWT_SECRET || "your-default-secret",
            { expiresIn: '10m' }
        );

        res.json({ message: "Answer correct", resetToken });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// 5. Forgot Password - Step 3: Reset Password
app.post("/auth/forgot/reset", async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        
        // Verify the special reset token
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || "your-default-secret");
        if (decoded.purpose !== "reset_password") {
            return res.status(403).json({ error: "Invalid token purpose" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(decoded.userId, { password: hashedPassword });

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        res.status(400).json({ error: "Invalid or expired token" });
    }
});

// --- PROFILE ROUTES ---
app.get("/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const updateData = { name, email };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    
    const user = await User.findByIdAndUpdate(req.userId, updateData, { new: true }).select("-password");
    res.json({ message: "Updated", user });
  } catch (err) {
    res.status(400).json({ error: "Update failed" });
  }
});

// --- DATA ROUTES (Groups/Tasks) ---
const apiRouter = express.Router();
app.use("/api", isAuthenticated, apiRouter);

apiRouter.get("/data", async (req, res) => {
  try {
    const userId = req.userId;
    const userGroups = await Group.find({ $or: [{ owner: userId }, { collaborators: userId }] });
    const groupIds = userGroups.map((g) => g._id);
    const userTasks = await Task.find({ $or: [{ owner: userId }, { group: { $in: groupIds } }] });
    
    // Map _id to id for frontend
    const cleanGroups = userGroups.map(d => ({ ...d.toObject(), id: d._id }));
    const cleanTasks = userTasks.map(d => ({ ...d.toObject(), id: d._id, group: d.group || null }));
    
    res.json({ groups: cleanGroups, tasks: cleanTasks });
  } catch (err) { res.status(500).json({ error: "Fetch error" }); }
});

apiRouter.post("/groups", async (req, res) => {
    const { name, type } = req.body;
    const group = new Group({ name, type, owner: req.userId, collaborators: type === 'collab' ? [req.userId] : [] });
    await group.save();
    res.status(201).json({ ...group.toObject(), id: group._id });
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
    await Group.updateOne({ _id: req.params.id, type: "collab" }, { $addToSet: { collaborators: user._id } });
    res.json({ message: "Added" });
});

apiRouter.post("/tasks", async (req, res) => {
    const task = new Task({ ...req.body, owner: req.userId, group: req.body.groupId || null });
    await task.save();
    res.status(201).json({ ...task.toObject(), id: task._id });
});

apiRouter.put("/tasks/:id", async (req, res) => {
    const { groupId, ...rest } = req.body;
    const update = { ...rest, group: groupId || null };
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
    // Basic implementation clearing user's completed tasks
    await Task.deleteMany({ owner: req.userId, done: true });
    res.json({ message: "Cleared" });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));