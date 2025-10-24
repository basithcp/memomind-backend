// models/User.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true, // unique index
    trim: true,
    lowercase: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

// ensure index exists
userSchema.index({ username: 1 }, { unique: true });

export default mongoose.model('User', userSchema);
