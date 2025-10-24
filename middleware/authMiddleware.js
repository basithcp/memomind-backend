// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'changeit';

export default function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const parts = authHeader.split(' ');
  const token = parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : null;

  if (!token) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, fullName, ... }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}
