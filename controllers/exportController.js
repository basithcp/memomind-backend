// controllers/exportController.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import fetchProcessedNote from "./export-utils/fetchProcessedNote.js";
import JSONToHTML from "./export-utils/JSONToHTML.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const exportNote = async (req, res) => {
  const { userId, itemId } = req.query;

  const { note } = await fetchProcessedNote(userId, itemId);
  if (!note) {
    return res.status(404).json({ error: "item could not be fetched" });
  }

  const JSONNote = { title: note.title, sections: note.sections };
  const html = await JSONToHTML(JSONNote);

  let browser;
  try {
    // Launch Puppeteer (install with: npm i puppeteer)
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });

    const page = await browser.newPage();
    // optional: set viewport for consistent layout
    await page.setViewport({ width: 1200, height: 800 });

    // Load the HTML and wait for fonts/images
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Generate PDF buffer
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });

    // Create unique filename and write to uploads
    const safeTitle = (note.title || "note").replace(/[^\w\- ]+/g, "");
    const filename = `${Date.now()}-${safeTitle.replace(/\s+/g, "_")}.pdf`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.promises.writeFile(filePath, pdfBuffer);

    // Send PDF as attachment (also saved on disk)
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length,
    });
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    return res.status(500).json({ error: "PDF generation failed" });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
};

export { exportNote };
