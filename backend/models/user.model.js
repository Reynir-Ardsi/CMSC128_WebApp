const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  securityQuestion: { type: String, required: true },
  securityAnswer: { type: String, required: true },
}, { timestamps: true });

// Hash password and security answer before saving
userSchema.pre('save', async function (next) {
  // If neither password nor security answer is modified, skip hashing
  if (!this.isModified('password') && !this.isModified('securityAnswer')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);

    // Hash password if modified
    if (this.isModified('password')) {
      this.password = await bcrypt.hash(this.password, salt);
    }
    
    // Hash security answer if modified
    if (this.isModified('securityAnswer')) {
       this.securityAnswer = await bcrypt.hash(this.securityAnswer, salt);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to compare entered answer with hashed answer
userSchema.methods.matchAnswer = async function (enteredAnswer) {
  return await bcrypt.compare(enteredAnswer, this.securityAnswer);
};

const User = mongoose.model('User', userSchema);
module.exports = User;