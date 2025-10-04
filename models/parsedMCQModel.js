
import mongoose from "mongoose";

const MCQSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  itemId: { type: String, required: true, index: true },
  itemName: {type: String, required: true},
  questions : [
    {
        question: { type: String, required: true, trim: true },
        options : {
            type: [String],
            required : true,
            validate: {
                validator: function(arr) {
                    return Array.isArray(arr) && arr.length == 2;
                },
                message: 'options must be an array with exactly 4 items'                
            }
        },
        answer : {
            type: Number,
            required : true,
            validate: {
                validator: function(n) {
                    return Number.isInteger(n) && n >= 0 && n < 4;
                },
                message: 'options must be an array with exactly 4 items'                 
            }
        }
    }
  ],
}, {
  timestamps: true
});


const MCQ =  mongoose.model('ParsedMCQSchema', MCQSchema);

export default MCQ;