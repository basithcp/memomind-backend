// processPdf.js (excerpt / modification)
import fsPromises from 'fs/promises';
import os from 'os';
import pLimit from 'p-limit';
// remove static import of pdf.mjs

import { makeTempDir, safeRmDir } from './DirController.js';
import ocrImage from './OCRController.js';
import preprocessImage from './ProcessImage.js';
import rasterizePageToPng from './Rasterize.js';

let _getDocumentFn = null;

async function ensurePdfjs() {
  if (_getDocumentFn) return _getDocumentFn;

  // Try node-friendly builds in order. Some pdfjs-dist versions expose different entry points.
  try {
    // Prefer CommonJS node build that avoids browser globals
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js'); // works when pdf.js is ESM or CommonJS default export
    _getDocumentFn = pdfjs.getDocument ?? pdfjs.default?.getDocument ?? (pdfjs.default || pdfjs).getDocument;
    return _getDocumentFn;
  } catch (err1) {
    try {
      // fallback to .node build if present
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.node.js');
      _getDocumentFn = pdfjs.getDocument ?? pdfjs.default?.getDocument ?? (pdfjs.default || pdfjs).getDocument;
      return _getDocumentFn;
    } catch (err2) {
      // last resort: try the .mjs browser build (may still fail if polyfills missing)
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      _getDocumentFn = pdfjs.getDocument ?? pdfjs.default?.getDocument ?? (pdfjs.default || pdfjs).getDocument;
      return _getDocumentFn;
    }
  }
}

export const processPdf = async (pdfPath, opts = {}) => {
  const getDocument = await ensurePdfjs();

  const {
    augmentIfHasLayer = false,
    skipImageOnlyPages = true,
    concurrency = Math.max(1, Math.floor(os.cpus().length / 2)),
    rasterDensity = 200,
  } = opts;

  const results = [];
  const tempDir = await makeTempDir('pdfproc-');

  const raw = new Uint8Array(await fsPromises.readFile(pdfPath));
  const loadingTask = getDocument({ data: raw });
  const doc = await loadingTask.promise;

  try {
    const numPages = doc.numPages || 0;
    const limit = pLimit(concurrency);

    const processPageFn = async (pageNum) => {
      try {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        const layerText = (content?.items || []).map(i => i.str).join(' ').trim();
        const hasLayer = (layerText || '').length > 20;

        if (hasLayer && !augmentIfHasLayer) {
          return { page: pageNum, source: 'layer', text: layerText, confidence: null };
        }

        if (!hasLayer && skipImageOnlyPages) {
          return { page: pageNum, source: 'skipped-image-only', text: '', confidence: null };
        }

        // rasterize -> preprocess -> OCR
        const imgPath = await rasterizePageToPng(pdfPath, pageNum, tempDir, rasterDensity);
        const preImgPath = await preprocessImage(imgPath);
        const { text: ocrText, confidence } = await ocrImage(preImgPath);

        if (preImgPath !== imgPath) {
          try { await fsPromises.unlink(preImgPath); } catch (e) {}
        }
        try { await fsPromises.unlink(imgPath); } catch (e) {}

        if (hasLayer && augmentIfHasLayer) {
          const merged = (layerText.includes(ocrText) || ocrText.includes(layerText)) ? layerText : (layerText + '\n\n[OCR-AUGMENT]\n' + ocrText);
          return { page: pageNum, source: 'layer+ocr', confidence, text: merged, layerText, ocrText };
        }

        const source = ocrText.length ? 'ocr' : 'empty';
        return { page: pageNum, source, confidence, text: ocrText };
      } catch (err) {
        return { page: pageNum, source: 'error', error: String(err) };
      }
    };

    const tasks = [];
    for (let i = 1; i <= numPages; i++) tasks.push(limit(() => processPageFn(i)));
    const pagesResult = await Promise.all(tasks);
    results.push(...pagesResult);

    return {
      pages: results,
      meta: {
        pagesProcessed: results.length,
        numPages: doc.numPages,
        opts: { augmentIfHasLayer, skipImageOnlyPages, concurrency, rasterDensity }
      }
    };
  } finally {
    try { await doc.destroy(); } catch (e) {}
    await safeRmDir(tempDir);
  }
};


export default processPdf;
