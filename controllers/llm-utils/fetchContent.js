import getPages from './getPages.js';

const fetchContent = async(userId, itemId) => {
    const response = await getPages(userId, itemId);
    
    if(response.pages) {
        const mergedText = response.pages
                            .sort((a,b) => a.page - b.page)
                            .map(p => p.text || "")
                            .join("\n");
        return {text : mergedText};
    }
    return response;
}

export default fetchContent;