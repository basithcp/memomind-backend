import mongoose from "mongoose";

const Schema = mongoose.Schema;

const PrevEntry = new Schema({
  role: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }   // <--- timestamp
}, { _id: false });

const ChatSchema = new Schema({
  userId: { type: String, required: true },
  itemId: { type: String, required: true },
  task: { type: String, required: true },
  prev: [PrevEntry],
});


export default mongoose.model('ChatSchema', ChatSchema);