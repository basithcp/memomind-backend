import fsPromises from 'fs/promises';
import path from 'path';
import { fromPath } from 'pdf2pic';

const rasterizePageToPng = async (pdfPath, pageIndex, outDir, density = 200) => {
  await fsPromises.mkdir(outDir, { recursive: true });
  const converter = fromPath(pdfPath, {
    density,
    format: 'png',
    savePath: outDir,
    saveFilename: `page_${pageIndex}`,
  });
  const res = await converter(pageIndex);
  return res.path || res.name || path.join(outDir, `page_${pageIndex}.png`);
};

export default rasterizePageToPng;