// content.controller.js
import Content from "../../models/ContentModel.js";

const getPages = async (userId, itemId) => {
  try {

    if (!userId || !itemId) {
      return {error:"invalid user or item" , status : 404}
    }

    const content = await Content.findOne({ userId, itemId }).lean();

    if (!content) {
      return { error: "No content found for the given user and item.", status : 404 };
    }

    return { pages: content.pages , status:200};
  } catch (err) {
    console.error("Error fetching pages:", err);
    return {error : "server error.", status:500};
  }
};

export default getPages;
