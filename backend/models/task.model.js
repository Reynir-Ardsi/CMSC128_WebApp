const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: true },
  done: { type: Boolean, default: false },
  priority: { type: String, enum: ['Low', 'Mid', 'High'], default: 'Low' },
  date: { type: String, default: '' },
  time: { type: String, default: '' },
  createdAt: { type: Number, default: Date.now },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  
  // For the "Undo" feature
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, { timestamps: true }); // Mongoose timestamps used for server-side logging

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;