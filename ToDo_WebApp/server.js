require("dotenv").config(); // loads .env when running locally

// Import dependencies
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Initialize app
const app = express();
app.use(express.json());
app.use(cors());

// separated for security on an env file
const mongoURI = process.env.Server_Connection_Key;

// Connect to MongoDB
mongoose.connect(mongoURI);

// Define Task schema
const TaskSchema = new mongoose.Schema({
    name: String,
    dueDate: String,
    dueTime: String,
    priority: String,
    done: Boolean,
    added: Number,
});
const Task = mongoose.model("Task", TaskSchema);

// Routes
app.get("/tasks", async (req, res) => {
    const tasks = await Task.find();
    res.json(tasks);
});

// Get a single task by ID
app.get("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch {
        res.status(400).json({ error: "Invalid task ID" });
    }
});

// Create a new task
app.post("/tasks", async (req, res) => {
    const task = new Task(req.body);
    await task.save();
    res.json(task);
});

// Update a task by ID
app.put("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch {
        res.status(400).json({ error: "Invalid task ID" });
    }
});

// Delete a task by ID
app.delete("/tasks/:id", async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json({ success: true });
    } catch {
        res.status(400).json({ error: "Invalid task ID" });
    }
});

// Start server
app.listen(5000, () => console.log("🚀 Server running..."));
