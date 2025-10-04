import fsPromises from 'fs/promises';
import os from 'os';
import pLimit from 'p-limit';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeTempDir, safeRmDir } from './DirController.js';
import ocrImage from './OCRController.js';
import preprocessImage from './ProcessImage.js';
import rasterizePageToPng from './Rasterize.js';
export const processPdf = async (pdfPath, opts = {}) => {
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
