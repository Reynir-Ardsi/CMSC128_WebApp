const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const Group = require('../models/group.model');
const Task = require('../models/task.model');
const User = require('../models/user.model');

// Custom helper to map _id to id for frontend compatibility
const mapItem = (item) => {
  const mapped = item.toObject();
  mapped.id = mapped._id.toString();
  delete mapped._id;
  delete mapped.__v;
  return mapped;
};

// @desc    Get all groups and tasks for the logged-in user
// @route   GET /api/data
router.get('/data', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find groups user owns OR is a collaborator on
    const groupsQuery = Group.find({
      $or: [{ owner: userId }, { collaborators: userId }],
    }).lean(); // .lean() makes it faster and gives plain JS objects
    
    // Find all tasks:
    // 1. Tasks user owns AND are not in a group (group: null)
    // 2. Tasks that are in a group the user owns or collaborates on
    
    // Get group IDs first
    const userGroups = await groupsQuery.clone().exec(); // Need to clone query to use it twice
    const groupIds = userGroups.map(g => g._id);

    const tasksQuery = Task.find({
      $and: [
        { isDeleted: false }, // Filter out "deleted" tasks
        {
          $or: [
            { owner: userId, group: null }, // My personal, ungrouped tasks
            { group: { $in: groupIds } }     // Any task in any of my groups
          ]
        }
      ]
    }).lean();

    const [groups, tasks] = await Promise.all([
      groupsQuery.exec(),
      tasksQuery.exec()
    ]);

    // Map _id to id for frontend
    const mappedGroups = groups.map(mapItem);
    const mappedTasks = tasks.map(mapItem);

    res.json({ groups: mappedGroups, tasks: mappedTasks });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- GROUPS ---

// @desc    Create a new group
// @route   POST /api/groups
router.post('/groups', protect, async (req, res) => {
  const { name, type } = req.body;
  try {
    const group = new Group({
      name,
      type,
      owner: req.user._id,
    });
    const createdGroup = await group.save();
    res.status(201).json(mapItem(createdGroup));
  } catch (error) {
    res.status(400).json({ error: 'Invalid group data' });
  }
});

// @desc    Delete a group
// @route   DELETE /api/groups/:id
router.delete('/groups/:id', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is the owner
    if (group.owner.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: 'Not authorized to delete this group' });
    }

    // When deleting a group, set tasks' group to null
    await Task.updateMany({ group: group._id }, { $set: { group: null } });
    
    await group.deleteOne(); // Replaced group.remove()

    res.json({ message: 'Group removed' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// @desc    Add a collaborator to a group
// @route   POST /api/groups/:id/collaborators
router.post('/groups/:id/collaborators', protect, async (req, res) => {
  const { email } = req.body;
  try {
    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    // Only owner can add collaborators
    if (group.owner.toString() !== req.user._id.toString()) {
      return res.status(401).json({ error: 'Not authorized' });
    }

    const userToAdd = await User.findOne({ email: email.toLowerCase() });
    if (!userToAdd) {
      return res.status(404).json({ error: 'User not found with that email' });
    }
    
    if (group.collaborators.includes(userToAdd._id)) {
      return res.status(400).json({ error: 'User already in group' });
    }
    
    group.collaborators.push(userToAdd._id);
    await group.save();
    res.json(mapItem(group));
  } catch (error) {
     res.status(500).json({ error: 'Server error' });
  }
});


// --- TASKS ---

// @desc    Create a new task
// @route   POST /api/tasks
router.post('/tasks', protect, async (req, res) => {
  const { name, date, time, priority, groupId } = req.body;
  try {
    const task = new Task({
      name,
      date,
      time,
      priority,
      group: groupId || null,
      owner: req.user._id, // The creator is the owner
      createdAt: Date.now(), // Match frontend timestamp
    });
    const createdTask = await task.save();
    res.status(201).json(mapItem(createdTask));
  } catch (error) {
    res.status(400).json({ error: 'Invalid task data' });
  }
});

// @desc    Update a task
// @route   PUT /api/tasks/:id
router.put('/tasks/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Here, you would check if user has permission to edit.
    // For simplicity, we'll allow any group member or owner to edit.
    // (A more complex check is needed for real-world apps)
    
    // Update fields that are provided
    task.name = req.body.name !== undefined ? req.body.name : task.name;
    task.date = req.body.date !== undefined ? req.body.date : task.date;
    task.time = req.body.time !== undefined ? req.body.time : task.time;
    task.priority = req.body.priority !== undefined ? req.body.priority : task.priority;
    task.groupId = req.body.groupId !== undefined ? req.body.groupId : task.group;
    task.done = req.body.done !== undefined ? req.body.done : task.done;

    const updatedTask = await task.save();
    res.json(mapItem(updatedTask));
  } catch (error) {
     res.status(400).json({ error: 'Invalid task data' });
  }
});

// @desc    "Delete" a task (soft delete for undo)
// @route   DELETE /api/tasks/:id
router.delete('/tasks/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Soft delete
    task.isDeleted = true;
    task.deletedAt = Date.now();
    await task.save();
    
    res.json({ message: 'Task marked as deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// @desc    Undo a task deletion
// @route   POST /api/tasks/:id/undo
router.post('/tasks/:id/undo', protect, async (req, res) => {
   try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    task.isDeleted = false;
    task.deletedAt = null;
    await task.save();
    
    res.json(mapItem(task));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});


// @desc    Clear all completed tasks (soft delete)
// @route   DELETE /api/tasks/completed
router.delete('/completed', protect, async (req, res) => {
  try {
    // This is complex. We must only delete tasks visible to the user.
    // 1. Get user's groups
     const userGroups = await Group.find({
      $or: [{ owner: req.user._id }, { collaborators: req.user._id }],
    }).lean();
    const groupIds = userGroups.map(g => g._id);

    // 2. Find all tasks that are done AND visible to user
    const filter = {
      done: true,
      isDeleted: false,
      $or: [
        { owner: req.user._id, group: null }, // My personal, ungrouped tasks
        { group: { $in: groupIds } }     // Any task in any of my groups
      ]
    };
    
    // 3. Soft delete them
    const update = {
      $set: {
        isDeleted: true,
        deletedAt: Date.now()
      }
    };
    
    const result = await Task.updateMany(filter, update);
    
    res.json({ message: `${result.modifiedCount} tasks cleared` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;