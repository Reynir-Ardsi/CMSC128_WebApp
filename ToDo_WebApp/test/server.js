require("dotenv").config(); // Load environment variables

// Dependencies
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const mongoURI = process.env.Server_Connection_Key;
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB connection failed:", err));

//TASK MANAGEMENT
const TaskSchema = new mongoose.Schema({
    name: String,
    dueDate: String,
    dueTime: String,
    priority: String,
    done: Boolean,
    added: Number,
});
const Task = mongoose.model("Task", TaskSchema);

// Get all tasks
app.get("/tasks", async (req, res) => {
    const tasks = await Task.find();
    res.json(tasks);
});

// Get a single task
app.get("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch {
        res.status(400).json({ error: "Invalid task ID" });
    }
});

// Create new task
app.post("/tasks", async (req, res) => {
    const task = new Task(req.body);
    await task.save();
    res.json(task);
});

// Update task
app.put("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch {
        res.status(400).json({ error: "Invalid task ID" });
    }
});

// Delete task
app.delete("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json({ success: true });
    } catch {
        res.status(400).json({ error: "Invalid task ID" });
    }
});

//USER ACCOUNT MANAGEMENT
const UserSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    securityQuestion: String,
    securityAnswer: String // hashed
});
const User = mongoose.model("User", UserSchema);

// Register
app.post("/accounts/register", async (req, res) => {
    try {
        const { name, email, password, question, answer } = req.body;
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: "Email already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedAnswer = await bcrypt.hash(answer, 10);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            securityQuestion: question,
            securityAnswer: hashedAnswer
        });

        await newUser.save();
        res.json({ message: "User registered successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error registering user" });
    }
});

// Login
app.post("/accounts/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        res.json({ message: "Login successful", userId: user._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error logging in" });
    }
});

// Forgot password: return security question
app.post("/accounts/forgot", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "Email not found" });

<<<<<<< Updated upstream
        res.json({ question: user.securityQuestion });
    } catch {
        res.status(500).json({ error: "Error processing request" });
=======
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
    const cleanGroups = userGroups.map(doc => ({ ...doc.toObject(), id: doc._id.toString() }));
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
>>>>>>> Stashed changes
    }
});

// Verify security answer
app.post("/accounts/verify-security", async (req, res) => {
    try {
        const { email, answer } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });

        const isCorrect = await bcrypt.compare(answer, user.securityAnswer);
        if (isCorrect) {
            res.json({ success: true });
        } else {
            res.status(400).json({ success: false, error: "Incorrect answer" });
        }
    } catch {
        res.status(500).json({ error: "Error verifying security answer" });
    }
});

// Get single user (for account_profile.html)
app.get("/accounts/:id", async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-__v");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Invalid user ID" });
    }
});

// Update account (name, email, password)
app.put("/accounts/:id", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const updateData = { name, email };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({ message: "Account updated successfully", user });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: "Failed to update account" });
    }
});

//SERVER START
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
