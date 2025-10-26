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
  if (!note) return res.status(404).json({ error: "item could not be fetched" });

  const JSONNote = { title: note.title, sections: note.sections };
  const html = await JSONToHTML(JSONNote);

  let browser;
  try {
    const launchOptions = {
      // use 'new' headless mode if supported; fallback to true otherwise
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };

    // If you have a system Chrome (or want to point to preinstalled chromium),
    // set PUPPETEER_EXECUTABLE_PATH or CHROME_PATH in Render. This will override
    // the bundled chromium (if present).
    const exePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
    if (exePath) {
      launchOptions.executablePath = exePath;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    // Wait for networkidle:0 ensures images/fonts finished loading
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });

    // Save file
    const safeTitle = (note.title || "note").replace(/[^\w\- ]+/g, "");
    const filename = `${Date.now()}-${safeTitle.replace(/\s+/g, "_")}.pdf`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.promises.writeFile(filePath, pdfBuffer);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": pdfBuffer.length,
    });
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    // include a hint for debugging
    if (String(err).includes("Could not find Chrome")) {
      return res.status(500).json({
        error: "PDF generation failed: Chrome not found. See logs or set PUPPETEER_EXECUTABLE_PATH.",
      });
    }
    return res.status(500).json({ error: "PDF generation failed" });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
};

export { exportNote };

