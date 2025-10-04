import express from 'express';
import { postFlashcards, postMCQs, postNotes } from '../controllers/saveController.js';

const router = express.Router();

router.post('/mcqs', postMCQs);
router.post('/notes', postNotes);
router.post('/flashcards', postFlashcards);

export default router;