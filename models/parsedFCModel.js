
import mongoose from "mongoose";

const FCSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  itemName: {type: String, required: true},
  questions : [
    {
        question: { type: String, required: true, trim: true },
        answer : { type: String, required: true, trim: true},
    }
  ],
}, {
  timestamps: true
});

const FC = mongoose.model('ParsedFCSchema', FCSchema);

export default FC;