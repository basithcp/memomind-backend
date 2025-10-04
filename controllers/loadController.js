import FCs from '../models/FlashCardsModel.js';
import MCQs from '../models/MCQsModel.js';
import Notes from '../models/NotesModel.js';

// GET all MCQs: newest -> oldest
export const loadMCQ = async (req, res) => {
  try {
    const userId = (req.params.userId ?? req.query.userId ?? req.body.userId ?? '').toString().trim();
    const itemId = (req.params.itemId ?? req.query.itemId ?? req.body.itemId ?? '').toString().trim();

    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId' });

    const mcq = await MCQs.findOne({ userId, itemId }).select('-__v').lean();

    if (!mcq) return res.status(404).json({ error: 'MCQ not found' });

    return res.status(200).json({ success: true, mcq });
  } catch (err) {
    console.error('getMCQByUserAndItem error:', err);
    return res.status(500).json({ error: 'Failed to fetch MCQ' });
  }
};

// GET all Notes: newest -> oldest
export const loadNote = async (req, res) => {
  try {
    const userId = (req.params.userId ?? req.query.userId ?? req.body.userId ?? '').toString().trim();
    const itemId = (req.params.itemId ?? req.query.itemId ?? req.body.itemId ?? '').toString().trim();

    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId' });

    const note = await Notes.findOne({ userId, itemId }).select('-__v').lean();

    if (!note) return res.status(404).json({ error: 'Note not found' });

    return res.status(200).json({ success: true, note });
  } catch (err) {
    console.error('getNoteByUserAndItem error:', err);
    return res.status(500).json({ error: 'Failed to fetch note' });
  }
};

// GET all Flashcards: newest -> oldest
export const loadFlashcard = async (req, res) => {
  try {
    const userId = (req.params.userId ?? req.query.userId ?? req.body.userId ?? '').toString().trim();
    const itemId = (req.params.itemId ?? req.query.itemId ?? req.body.itemId ?? '').toString().trim();

    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId' });

    const fc = await FCs.findOne({ userId, itemId }).select('-__v').lean();

    if (!fc) return res.status(404).json({ error: 'FC not found' });

    return res.status(200).json({ success: true, fc });
  } catch (err) {
    console.error('getFCByUserAndItem error:', err);
    return res.status(500).json({ error: 'Failed to fetch FC' });
  }
};