// controllers/exportController.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import fetchProcessedNote from "./export-utils/fetchProcessedNote.js";
import JSONToHTML from "./export-utils/JSONToHTML.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// ensure upload dir exists
try {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  console.warn('Could not ensure upload dir:', e?.message ?? e);
}

function findLocalChromium() {
  try {
    // 1) puppeteer's usual local-chromium location (recursive)
    const base = path.join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium');
    if (fs.existsSync(base)) {
      const stack = [base];
      const maxChecked = 10000;
      let checked = 0;
      while (stack.length && checked < maxChecked) {
        const p = stack.pop();
        checked++;
        let stat;
        try { stat = fs.statSync(p); } catch { continue; }
        if (stat.isFile()) {
          const name = path.basename(p).toLowerCase();
          if (['chrome','chromium','chrome.exe','chromium.exe'].includes(name)) return p;
        } else if (stat.isDirectory()) {
          const children = fs.readdirSync(p).map(c => path.join(p, c));
          for (const c of children) stack.push(c);
        }
      }
    }

    // 2) alt build folder 'chrome' (some installers put it here)
    const alt = path.join(process.cwd(), 'chrome');
    if (fs.existsSync(alt)) {
      const stack2 = [alt];
      while (stack2.length) {
        const p = stack2.pop();
        let stat;
        try { stat = fs.statSync(p); } catch { continue; }
        if (stat.isFile()) {
          const name = path.basename(p).toLowerCase();
          if (['chrome','chromium','chrome.exe','chromium.exe'].includes(name)) return p;
        } else if (stat.isDirectory()) {
          const children = fs.readdirSync(p).map(c => path.join(p, c));
          for (const c of children) stack2.push(c);
        }
      }
    }

    // 3) common system paths
    const possible = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/snap/bin/chromium'
    ];
    for (const p of possible) if (fs.existsSync(p)) return p;
  } catch (e) {
    console.warn('Error scanning for chromium:', e?.message ?? e);
  }
  return null;
}

const exportNote = async (req, res) => {
  const { userId, itemId } = req.query;
  if (!userId || !itemId) {
    return res.status(400).json({ error: "Missing userId or itemId in query" });
  }

  // fetch processed note from storage
  let note;
  try {
    const result = await fetchProcessedNote(userId, itemId);
    note = result?.note;
  } catch (e) {
    console.error('Failed to fetch processed note:', e);
    return res.status(500).json({ error: "Failed to fetch note" });
  }

  if (!note) {
    return res.status(404).json({ error: "Item could not be fetched" });
  }

  // convert JSON note -> HTML
  let html;
  try {
    const JSONNote = { title: note.title, sections: note.sections };
    html = await JSONToHTML(JSONNote);
  } catch (e) {
    console.error('Failed to convert note to HTML:', e);
    return res.status(500).json({ error: "Failed to generate HTML for PDF" });
  }

  let browser;
  try {
    // Try environment override first (Render env or Docker)
    const exeFromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
    const executablePath = exeFromEnv || findLocalChromium();

    console.log('PUPPETEER_EXECUTABLE_PATH env:', exeFromEnv ?? 'not set');
    console.log('Detected chromium executable:', executablePath ?? 'none');

    const launchOptions = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };

    if (executablePath) {
      launchOptions.executablePath = executablePath;
    } else {
      console.warn('No chromium executable found. Puppeteer will try its default — check build logs for download failures.');
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });

    // Wait for fonts/images/network
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

