import Note from '../../models/parsedNoteModel.js';

export default async function fetchProcessedNote(userId, itemId) {
  try {

    let note = null;
    if (userId && itemId) {
      note = await Note.findOne({ userId, itemId }).lean();
    } else {
      return { error: "Provide noteId or both userId and itemId." , status:400};
    }

    if (!note) return { error: "Note not found." , status:404};
    return { note };
  } catch (err) {
    console.error("getNote error:", err);
    return { error: "Failed to fetch note." , status:500};
  }
};