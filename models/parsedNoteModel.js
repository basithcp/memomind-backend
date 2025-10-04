// models/Note.js
import mongoose from "mongoose";

const { Schema } = mongoose;

// Create a Section schema and then add a recursive 'subsections' field that references itself.
const SectionSchema = new Schema(
  {
    heading: { type: String, required: true },
    paragraphs: { type: [String], default: [] },
    bulletlist : {
      description : {type : String, required : false},
      bullets: { type: [String], default: [] },
    }
    // subsections will be added below to allow recursion
  },
  { _id: false } // keep sections as subdocuments without their own _id (optional)
);

// Add subsections as an array of SectionSchema to allow arbitrary nesting
SectionSchema.add({
  subsections: { type: [SectionSchema], default: [] },
});

// Top-level Note schema
const JSONNoteSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    itemId: { type: String, required: true, index: true },
    itemName: {type: String, required: true},
    title: { type: String, required: true },
    meta: {
      author: { type: String, default: "" },
      topic: { type: String, default: "" },
      date: { type: Date, default: null },
    },
    sections: { type: [SectionSchema], default: [] },
    // optional: version/notes about the generator
    version: { type: String, default: "1" },
  },
  { timestamps: true }
);

const JSONNote = mongoose.model("ParsedJSONNote", JSONNoteSchema);

export default JSONNote;
