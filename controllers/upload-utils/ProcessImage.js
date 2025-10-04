import sharp from 'sharp';

const preprocessImage = async (imagePath) => {
  try {
    const tmpPath = `${imagePath}.pre.png`;
    await sharp(imagePath)
      .grayscale()
      .normalize()
      .resize({ width: 2000, withoutEnlargement: true })
      .toFile(tmpPath);
    return tmpPath;
  } catch (e) {
    return imagePath;
  }
};

export default preprocessImage;