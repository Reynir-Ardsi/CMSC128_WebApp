const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const Group = require('../models/group.model');
const Task = require('../models/task.model');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth.middleware');

// Helper to generate JWT and send it in an httpOnly cookie
const generateToken = (res, id) => {
  const token = jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development', // Use secure cookies in production
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

// @desc    Register a new user
// @route   POST /accounts/register
router.post('/register', async (req, res) => {
  const { name, email, password, question, answer } = req.body;

  try {
    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      securityQuestion: question,
      securityAnswer: answer.toLowerCase(), // Store answer in lowercase
    });

    if (user) {
      res.status(201).json({ message: 'User registered successfully' });
    } else {
      res.status(400).json({ error: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// @desc    Auth user & get token (Login)
// @route   POST /accounts/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (user && (await user.matchPassword(password))) {
      generateToken(res, user._id);
      // We don't send userId, we send an httpOnly cookie with the token
      res.status(200).json({ message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// @desc    Logout user
// @route   POST /accounts/logout
router.post('/logout', (req, res) => {
  // Clear the cookie
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// @desc    Forgot password - get security question
// @route   POST /accounts/forgot
router.post('/forgot', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }
    // We send the *question*, not the answer
    res.status(200).json({ question: user.securityQuestion });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// @desc    Verify security answer and log in
// @route   POST /accounts/verify-security
router.post('/verify-security', async (req, res) => {
  const { email, answer } = req.body;
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (await user.matchAnswer(answer.toLowerCase())) {
      // Answer is correct, log the user in by generating a token
      generateToken(res, user._id);
      res.status(200).json({ success: true });
    } else {
      res.status(401).json({ error: 'Incorrect answer' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Profile Page Routes ---

// @desc    Get user profile
// @route   GET /accounts/profile
router.get('/profile', protect, async (req, res) => {
  // req.user is attached by the 'protect' middleware
  if (req.user) {
    res.json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      securityQuestion: req.user.securityQuestion,
      // We DON'T send the password or answer
    });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// @desc    Update user profile
// @route   PUT /accounts/profile
router.put('/profile', protect, async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email.toLowerCase() || user.email;
    user.securityQuestion = req.body.securityQuestion || user.securityQuestion;
    
    // Only update answer if it was provided
    if (req.body.answer) {
      user.securityAnswer = req.body.answer.toLowerCase();
    }
    // Only update password if it was provided
    if (req.body.password) {
      user.password = req.body.password;
    }

    try {
      const updatedUser = await user.save();
      res.json({
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        securityQuestion: updatedUser.securityQuestion,
      });
    } catch (error) {
       // Handle duplicate email error
      if (error.code === 11000) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      res.status(500).json({ error: 'Server error during update' });
    }
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// @desc    Delete user account and all their data
// @route   DELETE /accounts/profile
router.delete('/profile', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Delete all groups owned by the user
    await Group.deleteMany({ owner: userId });
    
    // 2. Delete all tasks owned by the user
    await Task.deleteMany({ owner: userId });
    
    // 3. Remove user from any collaborator lists
    await Group.updateMany(
      { collaborators: userId },
      { $pull: { collaborators: userId } }
    );
    
    // 4. Delete the user
    await User.findByIdAndDelete(userId);

    // 5. Clear the auth cookie
    res.cookie('token', '', {
      httpOnly: true,
      expires: new Date(0),
    });

    res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error while deleting account' });
  }
});


module.exports = router;