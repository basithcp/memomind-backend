import Content from "../../models/ContentModel.js";

const savePdfResult = async (userId, itemId, itemName, pdfResult) => {
  try {

    // Prepare pages array exactly matching schema
    const pages = pdfResult.pages.map(page => ({
      page: page.page,
      source: page.source || null,
      text: page.text || null,
      confidence: page.confidence != null ? String(page.confidence) : null, // schema expects string
    }));

    // Create a new document
    const contentDoc = new Content({
      userId,
      itemId,
      itemName,
      pages,
    });

    // Save to MongoDB
    const saved = await contentDoc.save();
    console.log('Content saved successfully:', saved._id);
    return {status : "success"}
  } catch (err) {
    console.error('Error saving content:', err);
    return {status : "Error saving content"}
  }
};

export default savePdfResult;