import express from 'express';
import { loadFlashcard, loadMCQ, loadNote } from '../controllers/loadController.js';

const router = express.Router();

router.get('/mcqs', loadMCQ);
router.get('/notes', loadNote);
router.get('/flashcards', loadFlashcard);

export default router;