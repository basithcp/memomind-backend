import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const makeTempDir = async (prefix = 'pdfproc-') => {
  const base = os.tmpdir();
  const tmp = await fs.mkdtemp(path.join(base, prefix));
  return tmp;
};

const safeRmDir = async (dirPath) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

const clearUploads = async () => {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      await fs.unlink(filePath);
    }
    console.log('Uploads directory cleared.');
  } catch (err) {
    console.error('Failed to clear uploads:', err);
  }
};

export { clearUploads, makeTempDir, safeRmDir };
