// helpers/htmlBuilder.js

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert one section (and its subsections recursively) to HTML.
 * depth: 0 for top-level sections; increases for subsections.
 */
function sectionToHtml(section = {}, depth = 0) {
  const {
    heading = "",
    paragraphs = [],
    // legacySupport: some JSON may still have `bullets: []`
    bullets = [],
    // new structure: { description: "...", bullets: [ ... ] }
    bulletlist = null,
    subsections = []
  } = section;

  const indentPx = depth * 20; // indentation per level
  const headingLevel = Math.min(2 + depth, 6); // h2 for depth 0, h3 for depth1, ... max h6
  const headingHtml = heading ? `<h${headingLevel}>${escapeHtml(heading)}</h${headingLevel}>` : "";

  const paragraphsHtml = (paragraphs || [])
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join("\n");

  // Build bullet HTML: prefer bulletlist if present, otherwise fallback to legacy bullets
  let bulletsHtml = "";
  if (bulletlist && Array.isArray(bulletlist.bullets) && bulletlist.bullets.length) {
    const desc = bulletlist.description ? `<p class="bullet-desc">${escapeHtml(bulletlist.description)}</p>` : "";
    const items = bulletlist.bullets.map(it => `<li>${escapeHtml(it)}</li>`).join("");
    bulletsHtml = `${desc}<ul>${items}</ul>`;
  } else if (Array.isArray(bullets) && bullets.length) {
    bulletsHtml = `<ul>${bullets.map(it => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`;
  }

  const subsectionsHtml = (subsections || [])
    .map(sub => sectionToHtml(sub, depth + 1))
    .join("\n");

  return `<section class="section" style="margin-left:${indentPx}px">
    ${headingHtml}
    ${paragraphsHtml}
    ${bulletsHtml}
    ${subsectionsHtml}
  </section>`;
}

/**
 * Build the full HTML document string from JSON.
 * Supports optional `meta` object with author/topic/date.
 */
function JSONToHTML(jsonObj = {}) {
  const { title = "Document", meta = {}, sections = [] } = jsonObj;

  // meta rendering (optional)
  let metaHtml = "";
  if (meta && (meta.author || meta.topic || meta.date)) {
    const parts = [];
    if (meta.author) parts.push(`Author: ${escapeHtml(meta.author)}`);
    if (meta.topic) parts.push(`Topic: ${escapeHtml(meta.topic)}`);
    if (meta.date) parts.push(`Date: ${escapeHtml(meta.date)}`);
    metaHtml = `<div id="meta">${parts.join(" | ")}</div>`;
  }

  const sectionsHtml = (sections || [])
    .map(s => sectionToHtml(s, 0))
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    body{ font-family: Arial, sans-serif; padding:20px; color:#222; line-height:1.45; }
    #title{ width:fit-content; margin:0 auto 8px; }
    #meta{ text-align:center; color:#666; margin-bottom:18px; font-size:0.95rem; }
    .section{ padding:12px 0; border-bottom:1px solid #eee; }
    .bullet-desc{ margin:6px 0 4px; font-style:italic; color:#333; }
    ul{ margin:6px 0 12px 1.2rem; }
  </style>
</head>
<body>
  <h1 id="title">${escapeHtml(title)}</h1>
  ${metaHtml}
  <div id="container">
    ${sectionsHtml}
  </div>
</body>
</html>`;
}

export default JSONToHTML;
