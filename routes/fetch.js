import express from 'express';
import { getFlashcards, getMCQs, getNotes } from '../controllers/fetchController.js';

const router = express.Router();

router.get('/mcqs', getMCQs);
router.get('/notes', getNotes);
router.get('/flashcards', getFlashcards);

export default router;