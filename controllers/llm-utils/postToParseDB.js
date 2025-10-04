import FCModel from '../../models/parsedFCModel.js';
import MCQModel from '../../models/parsedMCQModel.js';
import Note from '../../models/parsedNoteModel.js';

const postToNotes = async (userId, itemId, document) => {
  try {

    if (!userId || !itemId) {
      return { error: "Missing userId or itemId in request body.", status:400 };
    }
    if (!document || typeof document !== "object") {
      return { error: "Missing document (parsed note) in request body." , status:400};
    }
    if (!document.title || !Array.isArray(document.sections)) {
      return { error: "Document must include title and sections array." , status:400};
    }

    // Prepare object to save
    const toSave = {
      userId,
      itemId,
      title: document.title,
      meta: {
        author: document.meta?.author ?? "",
        topic: document.meta?.topic ?? "",
        date: document.meta?.date ? new Date(document.meta.date) : null,
      },
      sections: document.sections,
      version: document.version ?? "1",
    };

    // Upsert (create or replace). Uses unique index on userId+itemId.
    const saved = await Note.findOneAndUpdate(
      { userId, itemId },
      { $set: toSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return { success: true};
  } catch (err) {
    console.error("createOrUpdateNote error:", err);
    // Handle duplicate key separately (in case unique index collided)
    if (err?.code === 11000) {
      return { error: "A note for this userId+itemId already exists (unique constraint)." , status:409};
    }
    return { error: "Failed to save note." , status:500};
  }
}


const postToMCQs = async (userId, itemId, document) => {
  try {
    if (!userId || !itemId) {
      return { error: 'Missing userId or itemId in request.', status: 400 };
    }
    if (!document || typeof document !== 'object') {
      return { error: 'Missing document in request body.', status: 400 };
    }
    if (!Array.isArray(document.questions)) {
      return { error: 'Document must include questions array.', status: 400 };
    }

    for (let i = 0; i < document.questions.length; i++) {
      const q = document.questions[i];
      if (!q || typeof q !== 'object') {
        return { error: `Question at index ${i} must be an object.`, status: 400 };
      }
      if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
        return { error: `question at index ${i} must be a non-empty string.`, status: 400 };
      }
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(opt => typeof opt !== 'string')) {
        return { error: `options for question at index ${i} must be an array of exactly 4 strings.`, status: 400 };
      }
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= 4) {
        return { error: `answer for question at index ${i} must be an integer index between 0 and 3.`, status: 400 };
      }
    }

    const toSave = {
      userId,
      itemId,
      questions: document.questions.map(q => ({
        question: q.question.trim(),
        options: q.options.map(s => (typeof s === 'string' ? s.trim() : s)),
        answer: q.answer
      }))
    };

    const saved = await MCQModel.findOneAndUpdate(
      { userId, itemId },
      { $set: toSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return { success: true, doc: saved ?? null };
  } catch (err) {
    console.error('postToMCQ error:', err);
    if (err?.code === 11000) {
      return { error: 'A question set for this userId+itemId already exists (unique constraint).', status: 409 };
    }
    return { error: 'Failed to save questions.', status: 500 };
  }
};

const postToFCs = async (userId, itemId, document) => {
  try {
    if (!userId || !itemId) return { error: 'Missing userId or itemId in request.', status: 400 };
    if (!document || typeof document !== 'object') return { error: 'Missing document in request body.', status: 400 };
    if (!Array.isArray(document.questions)) return { error: 'Document must include questions array.', status: 400 };

    for (let i = 0; i < document.questions.length; i++) {
      const q = document.questions[i];
      if (!q || typeof q !== 'object') return { error: `Question at index ${i} must be an object.`, status: 400 };
      if (!q.question || typeof q.question !== 'string' || !q.question.trim()) {
        return { error: `question at index ${i} must be a non-empty string.`, status: 400 };
      }
      if (!q.answer || typeof q.answer !== 'string' || !q.answer.trim()) {
        return { error: `answer at index ${i} must be a non-empty string.`, status: 400 };
      }
    }

    const toSave = {
      userId,
      itemId,
      questions: document.questions.map(q => ({
        question: q.question.trim(),
        answer: q.answer.trim()
      }))
    };

    const saved = await FCModel.findOneAndUpdate(
      { userId, itemId },
      { $set: toSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return { success: true, doc: saved ?? null };
  } catch (err) {
    console.error('postToFC error:', err);
    if (err?.code === 11000) return { error: 'A question set for this userId+itemId already exists (unique constraint).', status: 409 };
    return { error: 'Failed to save questions.', status: 500 };
  }
};

export { postToFCs, postToMCQs, postToNotes };

