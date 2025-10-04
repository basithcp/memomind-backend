import express from 'express';
import { deleteFlashcard, deleteMCQ, deleteNote } from '../controllers/deleteController.js';

const router = express.Router();

router.delete('/mcqs', deleteMCQ);
router.delete('/notes', deleteNote);
router.delete('/flashcards', deleteFlashcard);

export default router;