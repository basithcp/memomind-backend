import FCs from '../models/FlashCardsModel.js';
import MCQs from '../models/MCQsModel.js';
import Notes from '../models/NotesModel.js';

export const deleteMCQ = async (req, res) => {
  try {
    const userId = (req.params.userId ?? req.query.userId ?? req.body.userId ?? '').toString().trim();
    const itemId = (req.params.itemId ?? req.query.itemId ?? req.body.itemId ?? '').toString().trim();

    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId' });

    const deleted = await MCQs.findOneAndDelete({ userId, itemId }).select('-__v').exec();

    if (!deleted) return res.status(404).json({ error: 'MCQ not found' });

    return res.status(200).json({ success: true, deleted });
  } catch (err) {
    console.error('deleteMCQ error:', err);
    return res.status(500).json({ error: 'Failed to delete MCQ' });
  }
};

export const deleteNote = async (req, res) => {
  try {
    const userId = (req.params.userId ?? req.query.userId ?? req.body.userId ?? '').toString().trim();
    const itemId = (req.params.itemId ?? req.query.itemId ?? req.body.itemId ?? '').toString().trim();

    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId' });

    const deleted = await Notes.findOneAndDelete({ userId, itemId }).select('-__v').exec();

    if (!deleted) return res.status(404).json({ error: 'Note not found' });

    return res.status(200).json({ success: true, deleted });
  } catch (err) {
    console.error('deleteNote error:', err);
    return res.status(500).json({ error: 'Failed to delete note' });
  }
};

export const deleteFlashcard = async (req, res) => {
  try {
    const userId = (req.params.userId ?? req.query.userId ?? req.body.userId ?? '').toString().trim();
    const itemId = (req.params.itemId ?? req.query.itemId ?? req.body.itemId ?? '').toString().trim();

    if (!userId || !itemId) return res.status(400).json({ error: 'Missing userId or itemId' });

    const deleted = await FCs.findOneAndDelete({ userId, itemId }).select('-__v').exec();

    if (!deleted) return res.status(404).json({ error: 'Flashcard not found' });

    return res.status(200).json({ success: true, deleted });
  } catch (err) {
    console.error('deleteFlashcard error:', err);
    return res.status(500).json({ error: 'Failed to delete flashcard' });
  }
};
