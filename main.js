require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const auth = require('./auth');

let mainWindow = null;

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Remove leading numbering from section titles (e.g. "2. Ontario" -> "Ontario", "2.1 TRREB" -> "TRREB").
function stripTitleNumbering(s) {
  const t = String(s || '').trim();
  const stripped = t.replace(/^\s*\d+(\.\d+)*\.?\s*/, '').trim();
  return stripped.length > 0 ? stripped : t;
}

// Strip leading numbering from a line (for content). Returns { stripped: string, hadNumbering: boolean }.
function stripLineNumbering(line) {
  const m = /^\s*\d+(\.\d+)*\.?\s*/.exec(line);
  if (!m) return { stripped: line, hadNumbering: false };
  return { stripped: line.slice(m[0].length).trim(), hadNumbering: true };
}

function getElaboratedPath() {
  const base = __dirname;
  const names = ['canadian_mls.txt', 'Canadian_MLS.txt'];
  for (const name of names) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(base, 'canadian_mls.txt');
}

function getElaboratedPdfPath() {
  const base = __dirname;
  const names = ['CANADIAN_MLS.pdf', 'canadian_mls.pdf'];
  for (const name of names) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Extract text from PDF for elaborated view (PDF format: page markers "-- N of M --", tab-separated tables).
async function extractPdfText(pdfPath) {
  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return (data && typeof data.text === 'string') ? data.text : '';
  } catch (err) {
    console.error('PDF extract error:', err);
    return '';
  }
}

// Section heading patterns from CANADIAN_MLS.pdf (order matters for split).
const PDF_SECTION_HEADINGS = [
  'Quick Reference — Province/Territory Summary',
  'Official References & Links',
  '1. National Bodies',
  '2. Ontario Boards',
  '3. British Columbia Boards',
  '4. Alberta Boards',
  '5. Quebec, Prairie Provinces & Atlantic Boards',
  'Additional Official References — New Sections',
  '1 Privacy Law',
  '2 CASL, Accessibility & Competition',
  '3 RESO & Technical Standards',
  'Final Disclaimer & Document Governance',
];

// Parse PDF-extracted text into sections (by section headings from CANADIAN_MLS.pdf).
function parsePdfElaboratedSectionsByHeadings(pdfText) {
  let text = String(pdfText || '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/\n--\s*\d+\s+of\s+\d+\s*--\s*\n/g, '\n');
  const sections = [];
  const headings = [...PDF_SECTION_HEADINGS];
  let pos = 0;
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const idx = text.indexOf(heading, pos);
    if (idx < 0) continue;
    const contentStart = idx + heading.length;
    const nextIdx = i + 1 < headings.length
      ? text.indexOf(headings[i + 1], contentStart)
      : text.length;
    const content = text.slice(contentStart, nextIdx).trim();
    if (content.length > 0) sections.push({ title: heading, content });
    pos = nextIdx;
  }
  const firstHeading = headings[0];
  if (firstHeading && text.indexOf(firstHeading) > 0) {
    const intro = text.slice(0, text.indexOf(firstHeading)).trim();
    if (intro.length > 0) {
      const firstLine = intro.split('\n').find((l) => l.trim().length > 0);
      sections.unshift({ title: firstLine ? firstLine.trim().slice(0, 80) : 'Canadian MLS', content: intro });
    }
  }
  if (sections.length === 0 && text.length > 0) {
    sections.push({ title: 'Canadian MLS', content: text });
  }
  return sections;
}

// Render PDF section content: tab-separated lines → table; every other line → paragraph. Ensure ALL text is visible.
function pdfElaboratedTextToHtml(text) {
  const lines = String(text || '').split(/\n/).map((l) => l.trimEnd());
  const result = [];
  let tableRows = [];
  function flushTable() {
    if (tableRows.length === 0) return;
    result.push('<table class="doc-table">');
    tableRows.forEach((row, idx) => {
      const tag = idx === 0 ? 'th' : 'td';
      const cells = row.split(/\t/).map((c) => c.trim()).filter(Boolean);
      if (cells.length) {
        result.push('<tr>' + cells.map((c) => {
          const cellText = stripTitleNumbering(c);
          const escaped = linkify(cellText);
          return `<${tag}>${escaped}</${tag}>`;
        }).join('') + '</tr>');
      }
    });
    result.push('</table>');
    tableRows = [];
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/\t/.test(line) && line.trim().length > 0) {
      tableRows.push(line);
      i++;
      continue;
    }
    flushTable();
    if (!line.trim()) {
      result.push('<p class="doc-empty"></p>');
      i++;
      continue;
    }
    let para = line;
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (!next.trim()) break;
      if (/\t/.test(next)) break;
    if (/^https?:\/\//i.test(next.trim())) {
      para += ' ' + next.trim();
      i++;
      break;
    }
    if (para.length > 0 && /^[a-z0-9\-\.\/\)]+$/i.test(next.trim()) && !/[\s.:!?)]$/.test(para)) {
      para += ' ' + next.trim();
      i++;
    } else break;
    }
    const { stripped: restOfPara, hadNumbering } = stripLineNumbering(para);
    if (hadNumbering) {
      result.push('<p class="doc-bullet">' + linkify(restOfPara) + '</p>');
    } else {
      result.push('<p>' + linkify(para) + '</p>');
    }
    i++;
  }
  flushTable();
  return result.join('\n');
}

// Parse canadian_mls.txt into sections by "________________" dividers (elaborated version).
// Also split on "CREA & DDF" / "National Framework — CREA & DDF" so that block is its own section.
function parseElaboratedSections(txtContent) {
  const sections = [];
  const separator = /^\s*_{10,}\s*$/m;
  const parts = String(txtContent || '').split(separator).map((p) => p.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const block = parts[i];
    const lines = block.split(/\r?\n/).map((l) => l.trimEnd());
    const firstNonEmpty = lines.findIndex((l) => l.length > 0);
    if (firstNonEmpty === -1) continue;
    const titleLine = lines[firstNonEmpty];
    const title = stripTitleNumbering(titleLine.length > 120 ? titleLine.slice(0, 117) + '...' : titleLine) || `Section ${i + 1}`;
    const contentStart = firstNonEmpty + 1;
    const content = lines.slice(contentStart).join('\n').trim();
    sections.push({
      title: title || `Section ${i + 1}`,
      content: content || block,
    });
  }
  // Split any section that contains "CREA & DDF" / "National Framework — CREA & DDF" into two sections.
  const creaMarker = '\n\nCREA & DDF\nNational Framework — CREA & DDF\n\n';
  let out = [];
  for (const sec of sections) {
    const idx = sec.content.indexOf(creaMarker);
    if (idx >= 0) {
      const before = sec.content.slice(0, idx).trim();
      const after = sec.content.slice(idx + creaMarker.length).trim();
      if (before.length > 0) out.push({ title: sec.title, content: before });
      if (after.length > 0) out.push({ title: 'National Framework — CREA & DDF', content: after });
    } else {
      out.push(sec);
    }
  }
  // Split "National Framework — CREA & DDF" further: ONTARIO, RECO COMPLIANCE as separate sections.
  const ontarioMarker = /\n\nONTARIO\nOntario\n\n/i;
  const recoMarker = /\n\nRECO COMPLIANCE\nRECO COMPLIANCE\s*\n/i;
  const out2 = [];
  for (const sec of out) {
    if (sec.title !== 'National Framework — CREA & DDF') {
      out2.push(sec);
      continue;
    }
    const content = sec.content;
    const ontarioMatch = content.match(ontarioMarker);
    const recoMatch = content.match(recoMarker);
    if (!ontarioMatch || !recoMatch) {
      out2.push(sec);
      continue;
    }
    const beforeOntario = content.slice(0, ontarioMatch.index).trim();
    const afterOntarioStart = ontarioMatch.index + ontarioMatch[0].length;
    const recoStart = recoMatch.index;
    const ontarioContent = content.slice(afterOntarioStart, recoStart).trim();
    const recoContent = content.slice(recoMatch.index + recoMatch[0].length).trim();
    if (beforeOntario.length > 0) out2.push({ title: 'National Framework — CREA & DDF', content: beforeOntario });
    if (ontarioContent.length > 0) out2.push({ title: 'Ontario', content: ontarioContent });
    if (recoContent.length > 0) out2.push({ title: 'RECO COMPLIANCE', content: recoContent });
  }
  // Split "RECO Compliance Checklist for Marketplaces" from "British Columbia": BC as its own section.
  const bcMarker = /\n\nBRITISH COLUMBIA\nBritish Columbia\n\n/i;
  const out3 = [];
  for (const sec of out2) {
    const match = sec.content.match(bcMarker);
    if (!match) {
      out3.push(sec);
      continue;
    }
    const before = sec.content.slice(0, match.index).trim();
    const after = sec.content.slice(match.index + match[0].length).trim();
    if (before.length > 0) out3.push({ title: sec.title, content: before });
    if (after.length > 0) out3.push({ title: 'British Columbia', content: after });
  }
  // Split British Columbia (or any section) at ALBERTA / Alberta so Alberta is its own section.
  const albertaMarker = /\n\nALBERTA\nAlberta\n\n/i;
  const out4 = [];
  for (const sec of out3) {
    const match = sec.content.match(albertaMarker);
    if (!match) {
      out4.push(sec);
      continue;
    }
    const before = sec.content.slice(0, match.index).trim();
    const after = sec.content.slice(match.index + match[0].length).trim();
    if (before.length > 0) out4.push({ title: sec.title, content: before });
    if (after.length > 0) out4.push({ title: 'Alberta', content: after });
  }
  // Split remaining sections at: QUEBEC, PRAIRIE, ATLANTIC, FCNB, NSREC, PEI+NL, TERRITORIES, PRIVACY LAWS (each becomes its own section).
  const sectionMarkers = [
    { pattern: /\n\nQUEBEC\nQuebec\n\n/i, title: 'Quebec' },
    { pattern: /\n\nPRAIRIE\nPrairie Provinces \(Manitoba & Saskatchewan\)\n\n/i, title: 'Prairie Provinces (Manitoba & Saskatchewan)' },
    { pattern: /\n\nATLANTIC\nAtlantic Provinces\n\n/i, title: 'Atlantic Provinces' },
    { pattern: /\n\nFCNB\nThe "Licensee Disclosure" Rule\n\n/i, title: 'FCNB' },
    { pattern: /\n\nNSREC\n"Coming Soon" Advertising Policy\n\n/i, title: 'NSREC' },
    { pattern: /\n\nPEI \+ NL\nPrince Edward Island \(PEI\)\n\n/i, title: 'PEI + NL' },
    { pattern: /\n\nTERRITORIES\nTerritories\n\n/i, title: 'Territories' },
    { pattern: /\n\nPRIVACY LAWS\nPrivacy Law — PIPEDA, Provincial PIPA, and Quebec Law 25\n\n/i, title: 'Privacy Law — PIPEDA, Provincial PIPA, and Quebec Law 25' },
  ];
  let out5 = out4.length > 0 ? out4 : out3;
  let didSplit = true;
  while (didSplit) {
    didSplit = false;
    const next = [];
    for (const sec of out5) {
      let firstIndex = -1;
      let firstLen = 0;
      let firstTitle = '';
      for (const { pattern, title } of sectionMarkers) {
        const m = sec.content.match(pattern);
        if (m && (firstIndex < 0 || m.index < firstIndex)) {
          firstIndex = m.index;
          firstLen = m[0].length;
          firstTitle = title;
        }
      }
      if (firstIndex < 0) {
        next.push(sec);
        continue;
      }
      didSplit = true;
      const before = sec.content.slice(0, firstIndex).trim();
      const after = sec.content.slice(firstIndex + firstLen).trim();
      if (before.length > 0) next.push({ title: sec.title, content: before });
      if (after.length > 0) next.push({ title: stripTitleNumbering(firstTitle), content: after });
    }
    out5 = next;
  }
  return out5.map((sec) => ({ ...sec, title: stripTitleNumbering(sec.title) }));
}

// Convert elaborated plain text (with URLs, tabs, bullets) to HTML for display.
// Make all links clickable: full https? URLs and bare domains (e.g. crea.ca, member.realtor.ca/path).
// Bare domains are only linked when not already inside an <a> tag (avoids double-linking).
function linkify(text) {
  const escaped = escapeHtml(String(text || ''));
  const fullUrlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const bareDomainRegex = /\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.)+(?:ca|com|org|net)(?:\/[^\s<>")\]]*)?)/g;
  let out = escaped.replace(fullUrlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const anchorBlock = /<a\s[^>]*>[\s\S]*?<\/a>/gi;
  const parts = out.split(anchorBlock);
  const anchors = out.match(anchorBlock) || [];
  out = parts.map((part, i) => {
    const linkified = part.replace(bareDomainRegex, (m) => `<a href="https://${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
    return i < anchors.length ? linkified + anchors[i] : linkified;
  }).join('');
  return out;
}

function elaboratedTextToHtml(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = [];

  // Detect "Quick Reference" style table: rows are 5 lines each, starting with "Province" header.
  const provinceIdx = lines.findIndex((l) => l.trim() === 'Province');
  if (provinceIdx >= 0 && provinceIdx + 5 <= lines.length) {
    const intro = lines.slice(0, provinceIdx).map((l) => l.trimEnd()).join('\n').trim();
    if (intro) {
      result.push(...intro.split(/\n/).filter((l) => l.trim()).map((l) => {
        const line = l.trim();
        const { stripped: toShow, hadNumbering } = stripLineNumbering(line);
        const display = hadNumbering ? toShow : (/^\*\s+/.test(line) ? line.replace(/^\*\s+/, '') : line);
        if (hadNumbering || /^\*\s+/.test(line)) return '<p class="doc-bullet">' + linkify(display) + '</p>';
        return '<p>' + linkify(display) + '</p>';
      }));
    }
    const tableLines = lines.slice(provinceIdx);
    let rowStart = 0;
    const tableRows = [];
    while (rowStart + 5 <= tableLines.length) {
      const row = tableLines.slice(rowStart, rowStart + 5).map((c) => c.replace(/^\t/, '').trim());
      if (row.every((c) => !c) && tableRows.length > 0) break;
      if (row.some((c) => c.length > 0)) tableRows.push(row);
      rowStart += 5;
    }
    const remainderStart = provinceIdx + rowStart;
    if (tableRows.length > 0) {
      result.push('<table class="doc-table">');
      tableRows.forEach((row, idx) => {
        const tag = idx === 0 ? 'th' : 'td';
        result.push('<tr>' + row.map((c) => {
          const escaped = linkify(c);
          return `<${tag}>${escaped}</${tag}>`;
        }).join('') + '</tr>');
      });
      result.push('</table>');
    }
    const remainder = lines.slice(remainderStart).map((l) => l.trimEnd()).join('\n').trim();
    if (remainder) {
      result.push('');
      const rest = remainder.split(/\r?\n/);
      for (const rawLine of rest) {
        const line = rawLine.trimEnd();
        if (!line) { result.push('<p class="doc-empty"></p>'); continue; }
        const { stripped: restOfLine, hadNumbering } = stripLineNumbering(line);
        if (hadNumbering) {
          result.push('<p class="doc-bullet">' + linkify(restOfLine) + '</p>');
        } else if (/^\*\s+/.test(line)) result.push('<p class="doc-bullet">' + linkify(line.replace(/^\*\s+/, '')) + '</p>');
        else result.push('<p>' + linkify(line) + '</p>');
      }
    }
    return result.join('\n');
  }

  // Default: tab-separated table rows and paragraphs
  let tableRows = [];
  function flushTable() {
    if (tableRows.length === 0) return;
    result.push('<table class="doc-table">');
    tableRows.forEach((row, idx) => {
      const tag = idx === 0 ? 'th' : 'td';
      const cells = row.split(/\t/).map((c) => c.trim()).filter(Boolean);
      if (cells.length) {
        result.push('<tr>' + cells.map((c) => {
          const cellText = stripTitleNumbering(c);
          const escaped = linkify(cellText);
          return `<${tag}>${escaped}</${tag}>`;
        }).join('') + '</tr>');
      }
    });
    result.push('</table>');
    tableRows = [];
  }
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const hasTabs = /\t/.test(line);
    if (hasTabs && line.length > 0) {
      tableRows.push(line);
      continue;
    }
    flushTable();
    if (!line) {
      result.push('<p class="doc-empty"></p>');
      continue;
    }
    const { stripped: restOfLine, hadNumbering } = stripLineNumbering(line);
    if (hadNumbering) {
      result.push('<p class="doc-bullet">' + linkify(restOfLine) + '</p>');
    } else if (/^\*\s+/.test(line)) {
      result.push('<p class="doc-bullet">' + linkify(line.replace(/^\*\s+/, '')) + '</p>');
    } else {
      result.push('<p>' + linkify(line) + '</p>');
    }
  }
  flushTable();
  return result.join('\n');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#f8f9fa',
    show: false,
    titleBarStyle: 'default',
  });

  mainWindow = win;
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

// Extract keywords from title + content for chat matching
function extractKeywords(title, content) {
  const seen = new Set();
  const add = (w) => {
    const low = String(w).toLowerCase().replace(/[^\w]/g, '');
    if (low.length >= 2 && low.length <= 40) seen.add(low);
  };
  (title || '').split(/\s+/).forEach(add);
  const contentSample = (content || '').slice(0, 800);
  contentSample.split(/[\s\t\n,;:.—|()[\]]+/).forEach(add);
  return Array.from(seen);
}

// Extract links (label, url) from content
function extractLinksFromContent(content) {
  const links = [];
  const lines = String(content || '').split(/\r?\n/);
  const urlRe = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const skipLabels = /^(organization|official url|url)$/i;
  for (let i = 0; i < lines.length; i++) {
    const urls = lines[i].match(urlRe);
    if (urls) {
      let label = i > 0 ? lines[i - 1].replace(/\t/g, ' ').trim() : '';
      if (!label || /^https?:\/\//i.test(label) || skipLabels.test(label)) label = '';
      urls.forEach((url) => {
        const lbl = label && label.length <= 80 ? label : url;
        links.push({ label: lbl || url, url });
      });
    }
  }
  return links;
}

// Build knowledge from canadian_mls.txt and CANADIAN_MLS.pdf only
let cachedKnowledge = null;
async function getKnowledgeFromCanadianMls() {
  if (cachedKnowledge) return cachedKnowledge;
  const sections = [];
  const sectionByTitle = new Map();

  const addSection = (title, content) => {
    const contentTrim = content.replace(/\s+/g, ' ').trim();
    if (contentTrim.length < 40) return;
    const normTitle = title.replace(/\s+/g, ' ').trim().toLowerCase();
    const existing = sectionByTitle.get(normTitle);
    if (existing && existing.content.length >= contentTrim.length) return;
    const links = extractLinksFromContent(content);
    const answer = contentTrim.length > 1800 ? contentTrim.slice(0, 1797) + '...' : contentTrim;
    const keywords = extractKeywords(title, content);
    sectionByTitle.set(normTitle, { title, content, answer, links, keywords });
  };

  const txtPath = getElaboratedPath();
  if (fs.existsSync(txtPath)) {
    const txt = fs.readFileSync(txtPath, 'utf8');
    const parsed = parseElaboratedSections(txt);
    parsed
      .filter((s) => s.title !== 'Additional Official References — New Sections')
      .forEach((s) => addSection(s.title, s.content));
  }

  const pdfPath = getElaboratedPdfPath();
  if (pdfPath) {
    const pdfText = await extractPdfText(pdfPath);
    if (pdfText) {
      const pdfSections = parsePdfElaboratedSectionsByHeadings(pdfText);
      pdfSections
        .filter((s) => s.title !== 'Additional Official References — New Sections')
        .forEach((s) => addSection(s.title, s.content));
    }
  }

  sectionByTitle.forEach((s) => {
    sections.push({
      keywords: s.keywords,
      answer: s.answer,
      links: s.links,
    });
  });

  cachedKnowledge = {
    defaultAnswer: "I couldn't find a specific answer for that in the compliance guide. Try asking about a province (e.g. Ontario, BC, Quebec), a topic (e.g. DDF, VOW, PIPEDA, RECO), or a board (e.g. TRREB, CREA, GVR).",
    sections,
  };
  return cachedKnowledge;
}

// Load knowledge from canadian_mls.txt + CANADIAN_MLS.pdf only
ipcMain.handle('get-knowledge', async () => {
  try {
    return await getKnowledgeFromCanadianMls();
  } catch (err) {
    console.error('get-knowledge error:', err);
    return { defaultAnswer: 'Knowledge base failed to load. Ensure canadian_mls.txt and/or CANADIAN_MLS.pdf exist in the app folder.', sections: [] };
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Invalid URL' };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

// DOCS: use canadian_mls.txt and CANADIAN_MLS.pdf only (txt first for stable order; PDF sections appended if title not already present)
ipcMain.handle('get-compliance-sections', async () => {
  try {
    const sections = [];
    const seen = new Set();

    const addSection = (id, title, contentHtml) => {
      const norm = title.replace(/\s+/g, ' ').trim().toLowerCase();
      if (seen.has(norm)) return;
      seen.add(norm);
      const html = contentHtml && String(contentHtml).trim() ? contentHtml : '<p class="doc-empty">No content.</p>';
      sections.push({ id, title, contentHtml: html });
    };

    const txtPath = getElaboratedPath();
    if (fs.existsSync(txtPath)) {
      const txt = fs.readFileSync(txtPath, 'utf8');
      const parsed = parseElaboratedSections(txt);
      parsed
        .filter((s) => s.title !== 'Additional Official References — New Sections')
        .forEach((s, i) => {
          addSection(`section-${i}`, s.title, elaboratedTextToHtml(s.content));
        });
    }

    const pdfPath = getElaboratedPdfPath();
    if (pdfPath) {
      const pdfText = await extractPdfText(pdfPath);
      if (pdfText) {
        const pdfSections = parsePdfElaboratedSectionsByHeadings(pdfText);
        let pdfIndex = 0;
        pdfSections
          .filter((s) => s.title !== 'Additional Official References — New Sections')
          .forEach((s) => {
            addSection(`section-pdf-${pdfIndex++}`, s.title, pdfElaboratedTextToHtml(s.content));
          });
      }
    }

    return { ok: true, sections };
  } catch (err) {
    return { ok: false, error: err.message || String(err), sections: [] };
  }
});

app.whenReady().then(() => {
  // Register auth handlers after app is ready (app.getPath etc. need app ready)
  ipcMain.handle('check-auth', () => {
    const session = auth.loadSession();
    if (session) return { ok: true, user: { email: session.email, name: session.name } };
    const hasConfig = process.env.GOOGLE_CLIENT_ID && process.env.ALLOWED_DOMAIN;
    if (!hasConfig) return { ok: true, user: null }; // Allow access when auth not configured
    return { ok: false, user: null };
  });

  ipcMain.handle('start-google-auth', async () => {
    return auth.performGoogleAuth();
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
