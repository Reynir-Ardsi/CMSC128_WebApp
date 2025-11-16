const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

// This middleware checks for the auth token (in a cookie)
// and attaches the user to the request object (req.user)
const protect = async (req, res, next) => {
  let token;

  if (req.cookies.token) {
    try {
      // Get token from cookie
      token = req.cookies.token;

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token (excluding the hashed password)
      req.user = await User.findById(decoded.id).select('-password -securityAnswer');
      
      if (!req.user) {
         return res.status(401).json({ error: 'Not authorized, user not found' });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ error: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token' });
  }
};

module.exports = { protect };