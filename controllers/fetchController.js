import Flashcards from '../models/FlashCardsModel.js';
import MCQs from '../models/MCQsModel.js';
import Notes from '../models/NotesModel.js';

// Helper: sort newest -> oldest (use createdAt if present, else fallback to _id)
const NEWEST_FIRST = { createdAt: -1, _id: -1 };

// GET all MCQs: newest -> oldest
export const getMCQs = async (req, res) => {
  const {userId} = req.query;
  try {
    const mcqs = await MCQs.find({userId},{userId : 1, itemId : 1, itemName : 1, createdAt : 1, _id : 1})
      .sort(NEWEST_FIRST)
      .lean()
      .exec();

    res.status(200).json({ message: 'MCQs retrieved', count: mcqs.length, data: mcqs });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching MCQs', error: error.message });
  }
};

// GET all Notes: newest -> oldest
export const getNotes = async (req, res) => {
  const {userId} = req.query;
  try {
    const notes = await Notes.find({userId})
      .sort(NEWEST_FIRST)
      .lean()
      .exec();

    res.status(200).json({ message: 'Notes retrieved', count: notes.length, data: notes });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notes', error: error.message });
  }
};

// GET all Flashcards: newest -> oldest
export const getFlashcards = async (req, res) => {
  const {userId} = req.query;
  try {
    const flashcards = await Flashcards.find({userId})
      .sort(NEWEST_FIRST)
      .lean()
      .exec();

    res.status(200).json({ message: 'Flashcards retrieved', count: flashcards.length, data: flashcards });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching flashcards', error: error.message });
  }
};