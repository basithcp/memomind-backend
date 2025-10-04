import FCs from '../models/FlashCardsModel.js';
import MCQs from '../models/MCQsModel.js';
import Notes from '../models/NotesModel.js';
// post mcqs to db
export const postMCQs = async (req, res) => {
  const { userId, itemId, itemName, document } = req.body;
  try {
    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId in request.' });
    if (!document || typeof document !== 'object') return res.status(400).json({ error: 'Missing document in request body.' });
    if (!Array.isArray(document.questions)) return res.status(400).json({ error: 'Document must include questions array.' });

    for (let i = 0; i < document.questions.length; i++) {
      const q = document.questions[i];
      if (!q || typeof q !== 'object') return res.status(400).json({ error: `Question at index ${i} must be an object.` });
      if (!q.question || typeof q.question !== 'string' || !q.question.trim()) return res.status(400).json({ error: `question at index ${i} must be a non-empty string.` });
      if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(opt => typeof opt !== 'string')) return res.status(400).json({ error: `options for question at index ${i} must be an array of exactly 4 strings.` });
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= 4) return res.status(400).json({ error: `answer for question at index ${i} must be an integer index between 0 and 3.` });
    }

    const toSave = {
      userId,
      itemId,
      itemName,
      questions: document.questions.map(q => ({
        question: q.question.trim(),
        options: q.options.map(s => (typeof s === 'string' ? s.trim() : s)),
        answer: q.answer
      }))
    };

    const saved = await MCQs.findOneAndUpdate(
      { userId, itemId },
      { $set: toSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ data: saved ?? null });
  } catch (err) {
    console.error('postToMCQ error:', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A question set for this userId+itemId already exists (unique constraint).' });
    return res.status(500).json({ error: 'Failed to save questions.' });
  }
};

// post notes to db
export const postNotes = async (req, res) => {
  const { userId, itemId, itemName, document } = req.body;
  try {
    if (!userId || !itemId) return res.status(400).json({ error: "Missing userId or itemId in request body." });
    if (!document || typeof document !== "object") return res.status(400).json({ error: "Missing document (parsed note) in request body." });
    if (!document.title || !Array.isArray(document.sections)) return res.status(400).json({ error: "Document must include title and sections array." });

    const toSave = {
      userId,
      itemId,
      itemName,
      title: document.title,
      meta: {
        author: document.meta?.author ?? "",
        topic: document.meta?.topic ?? "",
        date: document.meta?.date ? new Date(document.meta?.date) : null,
      },
      sections: document.sections,
      version: document.version ?? "1",
    };

    const saved = await Notes.findOneAndUpdate(
      { userId, itemId },
      { $set: toSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ data: saved ?? null });
  } catch (err) {
    console.error("createOrUpdateNote error:", err);
    if (err?.code === 11000) return res.status(409).json({ error: "A note for this userId+itemId already exists (unique constraint)." });
    return res.status(500).json({ error: "Failed to save note." });
  }
};

// post flashcards to db
export const postFlashcards = async (req, res) => {
  const { userId, itemId, itemName, document } = req.body;
  try {
    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId in request.' });
    if (!document || typeof document !== 'object') return res.status(400).json({ error: 'Missing document in request body.' });
    if (!Array.isArray(document.questions)) return res.status(400).json({ error: 'Document must include questions array.' });

    for (let i = 0; i < document.questions.length; i++) {
      const q = document.questions[i];
      if (!q || typeof q !== 'object') return res.status(400).json({ error: `Question at index ${i} must be an object.` });
      if (!q.question || typeof q.question !== 'string' || !q.question.trim()) return res.status(400).json({ error: `question at index ${i} must be a non-empty string.` });
      if (!q.answer || typeof q.answer !== 'string' || !q.answer.trim()) return res.status(400).json({ error: `answer at index ${i} must be a non-empty string.` });
    }

    const toSave = {
      userId,
      itemId,
      itemName,
      questions: document.questions.map(q => ({
        question: q.question.trim(),
        answer: q.answer.trim()
      }))
    };

    const saved = await FCs.findOneAndUpdate(
      { userId, itemId },
      { $set: toSave },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ data: saved ?? null });
  } catch (err) {
    console.error('postToFC error:', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A question set for this userId+itemId already exists (unique constraint).' });
    return res.status(500).json({ error: 'Failed to save questions.' });
  }
};