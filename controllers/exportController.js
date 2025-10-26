// controllers/exportController.js
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// near top of controllers/exportController.js
// ... other imports ...

function findLocalChromium() {
  try {
    // 1) check puppeteer's usual local-chromium location
    const base = path.join(process.cwd(), 'node_modules', 'puppeteer', '.local-chromium');
    if (fs.existsSync(base)) {
      const releases = fs.readdirSync(base);
      for (const r of releases) {
        const linuxPath = path.join(base, r, 'chrome-linux', 'chrome');
        if (fs.existsSync(linuxPath)) return linuxPath;
        const winPath = path.join(base, r, 'chrome-win', 'chrome.exe');
        if (fs.existsSync(winPath)) return winPath;
        const macPath = path.join(base, r, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
        if (fs.existsSync(macPath)) return macPath;
      }
    }

    // 2) also check the 'chrome' location where @puppeteer/browsers sometimes places it in build
    const altBase = path.join(process.cwd(), 'chrome');
    if (fs.existsSync(altBase)) {
      // chrome/<version>/chrome-linux64/chrome or chrome/<version>/chrome-linux/chrome
      const versions = fs.readdirSync(altBase);
      for (const v of versions) {
        const c1 = path.join(altBase, v, 'chrome-linux64', 'chrome');
        const c2 = path.join(altBase, v, 'chrome-linux', 'chrome');
        if (fs.existsSync(c1)) return c1;
        if (fs.existsSync(c2)) return c2;
      }
      // if the installer left a top-level 'chrome' binary (rare)
      const direct = path.join(altBase, 'chrome');
      if (fs.existsSync(direct)) return direct;
    }

    // 3) fallback locations (common)
    const possible = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome'
    ];
    for (const p of possible) if (fs.existsSync(p)) return p;
  } catch (e) {
    console.warn('Error scanning for chromium:', e?.message ?? e);
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

