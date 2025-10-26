// controllers/exportController.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// near top of controllers/exportController.js
// ... other imports ...

function findLocalChromium() {
  try {
    const base = path.join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium');
    if (!fs.existsSync(base)) return null;
    const releases = fs.readdirSync(base);
    for (const r of releases) {
      // check likely platforms
      const linuxPath = path.join(base, r, 'chrome-linux', 'chrome');
      if (fs.existsSync(linuxPath)) return linuxPath;
      const winPath = path.join(base, r, 'chrome-win', 'chrome.exe');
      if (fs.existsSync(winPath)) return winPath;
      const macPath = path.join(base, r, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
      if (fs.existsSync(macPath)) return macPath;
    }
  } catch (e) {
    console.warn('Error scanning for local Chromium:', e?.message ?? e);
  }
  return null;
}

const exportNote = async (req, res) => {
  // ... your existing fetch and HTML generation ...

  let browser;
  try {
    // Try environment override first (set this in Render if using system Chrome)
    const exeFromEnv = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
    let executablePath = exeFromEnv || findLocalChromium();

    console.log('PUPPETEER_EXECUTABLE_PATH env:', exeFromEnv ?? 'not set');
    console.log('Found local chromium at:', executablePath ?? 'none');

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

    // ... rest of your code remains the same (page.setContent, pdf, save, send) ...

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

