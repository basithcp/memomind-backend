// controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// read JWT_SECRET from env
const JWT_SECRET = process.env.JWT_SECRET || 'changeit';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Helper to create token
function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export const signup = async (req, res) => {
  try {
    const { username, fullName, password, confirmPassword } = req.body;

    // basic validation
    if (!username || !fullName || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // check existing user
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      username: username.toLowerCase(),
      fullName,
      passwordHash,
    });

    const saved = await newUser.save();

    const token = createToken(saved);

    return res.status(201).json({
      message: 'User created successfully.',
      token,
      user: { id: saved._id, username: saved.username, fullName: saved.fullName },
    });
  } catch (err) {
    // Duplicate key error guard
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Username already exists.' });
    }
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error while creating user.' });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const token = createToken(user);

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: { id: user._id, username: user.username, fullName: user.fullName },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error while logging in.' });
  }
};
