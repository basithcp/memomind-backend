// uploadController.js
// ESM module. Designed to be robust in environments without native binaries.
// - Skips image-only pages by default (skipImageOnlyPages: true)
// - Lazy, defensive Tesseract.js initialization (won't crash if unavailable)
// - Single PDF load, per-request temp dir and cleanup

import crypto from 'crypto';
import { clearUploads } from './upload-utils/DirController.js';
import processPdf from './upload-utils/ProcessPdf.js';
import savePdfResult from './upload-utils/savePdfResult.js';
/* ---------------------------
   Express handler: uploadFile
   - assumes multer.diskStorage so req.file.path exists
   - uses processPdf with skipImageOnlyPages=true by default
   --------------------------- */
export const uploadFile = async (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ error: 'Error in uploading file' });
  }
  const ext = req.file.originalname.split('.').pop().toLowerCase();
  if (ext !== 'pdf') {
    await clearUploads();
    return res.status(400).json({ error: 'Invalid file type. Only PDFs allowed.' });
  }
  const pdfPath = req.file.path;
  console.log(req.file.originalname);
  
  try {
    // Don't force OCR init here; it's lazy inside ocrImage if needed
    const result = await processPdf(pdfPath, { augmentIfHasLayer: false, skipImageOnlyPages: true });
    // Optionally remove uploaded file after processing — uncomment if desired
    // try { await fsPromises.unlink(pdfPath); } catch(e) {}
    const {userId} = req.body;
    const itemId = crypto.randomBytes(16).toString('hex');
    const itemName = req.file.originalname;
    const {status} = await savePdfResult(userId, itemId, itemName, result);
    await clearUploads();
    if(status === "success") return res.status(201).json({msg : "file successfully uploaded!", itemId : itemId, itemName : itemName})
    return res.status(500).json({ error : status });
  } catch (err) {
    console.error('PDF processing failed:', err);
    return res.status(500).json({ error: String(err) });
  }
};
