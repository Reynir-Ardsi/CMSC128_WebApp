require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); // <-- NEW

// --- EXPRESS & CORS SETUP ---
const app = express();
app.use(express.json());

// CORS setup is simpler: no credentials needed
app.use(cors());

// --- MONGODB CONNECTION ---
const mongoURI = process.env.Server_Connection_Key;
mongoose
  .connect(mongoURI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err));

// --- MONGOOSE SCHEMAS ---
// (User, Group, Task, DeletedTask schemas are IDENTICAL to the previous file...
// ... so I will omit them for brevity. Copy them from the previous answer.)

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


// --- JWT AUTH MIDDLEWARE ---
// This REPLACES the old 'isAuthenticated'
const isAuthenticated = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (token == null) {
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  // !! Add JWT_SECRET to your .env file
  jwt.verify(token, process.env.JWT_SECRET || "your-default-secret", (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden: Invalid token." });
    }
    // Add the user ID from the token payload to the request object
    req.userId = decoded.userId;
    next();
  });
};


// --- AUTH ROUTES ---

// Register (No auth needed)
app.post("/auth/register", async (req, res) => {
    // (This logic is unchanged)
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: "Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ name, email, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Login (This is the main change)
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    // 1. Create JWT Payload
    const payload = { userId: user._id };

    // 2. Sign the token
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET || "your-default-secret", // !! Use .env
      { expiresIn: '1d' } // Token expires in 1 day
    );

    // 3. Send token to client
    res.json({ message: "Login successful", token: token, userId: user._id, name: user.name });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Logout (Stateless)
app.post("/auth/logout", (req, res) => {
  // With JWT, logout is handled by the client (deleting the token).
  // This endpoint is just here to be polite.
  res.json({ message: "Logged out successfully" });
});

// Get/Update Profile (Now use req.userId from the token)
app.get("/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password"); // <-- CHANGED
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Profile Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const updateData = { name, email };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.userId, updateData, { // <-- CHANGED
      new: true,
    }).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ message: "Account updated successfully", user });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(400).json({ error: "Failed to update account" });
  }
});


// --- DASHBOARD API ROUTES (Protected) ---
const apiRouter = express.Router();
app.use("/api", isAuthenticated, apiRouter); // Protect all /api routes

// GET /api/data
apiRouter.get("/data", async (req, res) => {
  try {
    const userId = req.userId; // <-- CHANGED
    const userGroups = await Group.find({ $or: [{ owner: userId }, { collaborators: userId }] });
    const groupIds = userGroups.map((g) => g._id);
    const userTasks = await Task.find({ $or: [{ owner: userId }, { group: { $in: groupIds } }] });
    const cleanGroups = userGroups.map(doc => ({ ...doc.toObject(), id: doc._id }));
    const cleanTasks = userTasks.map(doc => ({ ...doc.toObject(), id: doc._id, group: doc.group ? doc.group.toString() : null }));
    res.json({ groups: cleanGroups, tasks: cleanTasks });
  } catch (err) {
    console.error("GET /api/data Error:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// --- Group Routes ---
apiRouter.post("/groups", async (req, res) => {
  try {
    const { name, type } = req.body;
    const ownerId = req.userId; // <-- CHANGED
    const group = new Group({ name, type, owner: ownerId, collaborators: type === "collab" ? [ownerId] : [] });
    await group.save();
    res.status(201).json({ ...group.toObject(), id: group._id });
  } catch (err) {
    console.error("POST /api/groups Error:", err);
    res.status(500).json({ error: "Failed to create group" });
  }
});

apiRouter.delete("/groups/:id", async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.userId; // <-- CHANGED
    const group = await Group.findOne({ _id: groupId, owner: userId });
    if (!group) {
      return res.status(403).json({ error: "You are not the owner of this group" });
    }
    await Task.updateMany({ group: groupId }, { $set: { group: null } });
    await Group.findByIdAndDelete(groupId);
    res.json({ message: "Group deleted. Tasks are now ungrouped." });
  } catch (err) {
    console.error("DELETE /api/groups Error:", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

apiRouter.post("/groups/:id/collaborators", async (req, res) => {
  // (This logic is unchanged, it's just protected by the JWT middleware)
  try {
    const groupId = req.params.id;
    const { email } = req.body;
    const userToAdd = await User.findOne({ email });
    if (!userToAdd) {
      return res.status(404).json({ error: "User with that email not found" });
    }
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.type !== "collab") {
      return res.status(400).json({ error: "Group is not collaborative" });
    }
    await Group.findByIdAndUpdate(groupId, { $addToSet: { collaborators: userToAdd._id } });
    res.json({ message: "Collaborator added" });
  } catch (err) {
    console.error("POST /api/collaborators Error:", err);
    res.status(500).json({ error: "Failed to add collaborator" });
  }
});

// --- Task Routes ---
apiRouter.post("/tasks", async (req, res) => {
  try {
    const { name, date, time, priority, groupId } = req.body;
    const task = new Task({
      name, date, time, priority,
      group: groupId || null,
      owner: req.userId, // <-- CHANGED
      createdAt: Date.now(),
    });
    await task.save();
    res.status(201).json({ ...task.toObject(), id: task._id });
  } catch (err) {
    console.error("POST /api/tasks Error:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

apiRouter.put("/tasks/:id", async (req, res) => {
  // (This logic is unchanged)
  try {
    const { name, date, time, priority, groupId, done } = req.body;
    const updateData = { name, date, time, priority, group: groupId, done };
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    if (updateData.groupId === "") updateData.group = null;
    const task = await Task.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!task) return res.status(404).json({ error: "Task not found" });
    res.json({ ...task.toObject(), id: task._id });
  } catch (err) {
    console.error("PUT /api/tasks Error:", err);
    res.status(500).json({ error: "Failed to update task" });
  }
});

apiRouter.delete("/tasks/:id", async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    await new DeletedTask({ taskData: task, owner: req.userId }).save(); // <-- CHANGED
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("DELETE /api/tasks Error:", err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

apiRouter.post("/tasks/:id/undo", async (req, res) => {
  try {
    const taskId = req.params.id;
    const deleted = await DeletedTask.findOne({
      "taskData._id": taskId,
      owner: req.userId, // <-- CHANGED
    }).sort({ expiresAt: -1 });
    if (!deleted) {
      return res.status(404).json({ error: "Undo data not found or expired" });
    }
    const restoredTask = new Task(deleted.taskData);
    await restoredTask.save();
    await DeletedTask.findByIdAndDelete(deleted._id);
    res.json({ message: "Task restored", task: restoredTask });
  } catch (err) {
    console.error("POST /api/undo Error:", err);
    res.status(500).json({ error: "Failed to restore task" });
  }
});

apiRouter.delete("/tasks/completed", async (req, res) => {
  try {
    const userId = req.userId; // <-- CHANGED
    const userGroups = await Group.find({ $or: [{ owner: userId }, { collaborators: userId }] });
    const groupIds = userGroups.map((g) => g._id);
    const result = await Task.deleteMany({
      done: true,
      $or: [{ owner: userId }, { group: { $in: groupIds } }],
    });
    res.json({ message: `${result.deletedCount} completed tasks cleared` });
  } catch (err) {
    console.error("DELETE /api/completed Error:", err);
    res.status(500).json({ error: "Failed to clear completed tasks" });
  }
});

// --- SERVER START ---
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));