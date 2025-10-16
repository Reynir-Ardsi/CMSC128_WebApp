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
});
const User = mongoose.model("User", UserSchema);

// Register
app.post("/accounts/register", async (req, res) => {
    try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashed });
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

// Forgot password (mock)
app.post("/accounts/forgot", async (req, res) => {
    try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Email not found" });

    // (You can later integrate email sending with nodemailer or Twilio SendGrid)
    res.json({ message: "Password reset link sent (mock)" });
    } catch {
    res.status(500).json({ error: "Error processing request" });
    }
});

// Get single user (for account_profile.html)
app.get("/accounts/:id", async (req, res) => {
    try {
    const user = await User.findById(req.params.id).select("-__v"); // exclude __v
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

// Delete account
app.delete("/accounts/:id", async (req, res) => {
    try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Account deleted successfully" });
    } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Failed to delete account" });
    }
});

//SERVER START
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
