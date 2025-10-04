import TesseractModule from 'tesseract.js';

let ocrWorker = null;
let ocrInitPromise = null;
let ocrAvailable = true; // optimistic; flips to false on detection/failure

const getCreateWorkerFn = () => {
  if (typeof TesseractModule?.createWorker === 'function') return TesseractModule.createWorker;
  if (typeof TesseractModule?.default?.createWorker === 'function') return TesseractModule.default.createWorker;
  return null;
};

const initOcr = async () => {
  if (!ocrAvailable) return false;
  if (ocrInitPromise) return ocrInitPromise;

  const createWorkerFn = getCreateWorkerFn();
  if (!createWorkerFn) {
    console.warn('tesseract.js createWorker() not found. OCR disabled. To enable, ensure tesseract.js is installed and importable.');
    ocrAvailable = false;
    return false;
  }

  ocrInitPromise = (async () => {
    try {
      ocrWorker = createWorkerFn();
      if (!ocrWorker || typeof ocrWorker.load !== 'function') {
        console.warn('ocrWorker missing load() — tesseract.js may be incompatible. OCR disabled.');
        ocrAvailable = false;
        return false;
      }
      await ocrWorker.load();
      await ocrWorker.loadLanguage('eng');
      await ocrWorker.initialize('eng');
      return true;
    } catch (err) {
      console.error('Failed to initialize OCR worker:', err);
      ocrAvailable = false;
      return false;
    }
  })();

  return ocrInitPromise;
};

const terminateOcr = async () => {
  try {
    if (ocrWorker && typeof ocrWorker.terminate === 'function') {
      await ocrWorker.terminate();
    }
  } catch (e) {
    // ignore
  } finally {
    ocrWorker = null;
    ocrInitPromise = null;
    ocrAvailable = false;
  }
};

const ocrImage = async (imagePath) => {
  if (!ocrAvailable) return { text: '', confidence: 0 };
  const ok = await initOcr();
  if (!ok) return { text: '', confidence: 0 };

  try {
    const { data } = await ocrWorker.recognize(imagePath);
    const text = (data?.text || '').trim();
    const words = data?.words || [];
    const confidences = Array.isArray(words) && words.length ? words.map(w => w.confidence || 0) : [];
    const avgConf = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    return { text, confidence: avgConf };
  } catch (err) {
    console.error('OCR recognition failed:', err);
    ocrAvailable = false;
    return { text: '', confidence: 0 };
  }
};

export default ocrImage;
