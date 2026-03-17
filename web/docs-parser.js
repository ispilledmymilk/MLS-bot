/**
 * Generic document parser for uploaded compliance docs (USA, Portugal, Mexico).
 * Supports TXT, MD, and PDF. Outputs sections with title + content + HTML for viewer.
 */

import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const REGIONS = ['usa', 'portugal', 'mexico', 'canada'];

function stripTitleNumbering(s) {
  const t = String(s || '').trim();
  return t.replace(/^\s*\d+(\.\d+)*\.?\s*/, '').trim() || t;
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkify(text) {
  const escaped = escapeHtml(String(text || ''));
  const fullUrl = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const bareDomain = /\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.)+(?:ca|com|org|net|pt|mx)(?:\/[^\s<>")\]]*)?)/g;
  let out = escaped.replace(fullUrl, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const anchorBlock = /<a\s[^>]*>[\s\S]*?<\/a>/gi;
  const parts = out.split(anchorBlock);
  const anchors = out.match(anchorBlock) || [];
  out = parts.map((part, i) => {
    const linkified = part.replace(bareDomain, (m) => `<a href="https://${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
    return i < anchors.length ? linkified + anchors[i] : linkified;
  }).join('');
  return out;
}

function textToHtml(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = [];
  let tableRows = [];
  function flushTable() {
    if (tableRows.length === 0) return;
    const rows = tableRows.map((row) =>
      row.split(/\t/).map((c) => linkify((c || '').trim()) || '')
    );
    const colCount = Math.max(0, ...rows.map((r) => r.length));
    function padCells(cells) {
      const out = [...cells];
      while (out.length < colCount) out.push('');
      return out.slice(0, colCount);
    }
    // Detect 2-col "label/value pairs": header = 2 rows (e.g. Rule, Implementation Requirement); data = alternating label then value (both tab-prefixed), merge into rows
    const isTwoCol = colCount <= 2;
    const dataRows = rows.slice(2);
    const firstColEmptyInData = dataRows.length > 0 && dataRows.every((r) => (padCells(r)[0] || '').replace(/&nbsp;|&#39;/g, '').trim() === '');
    const hasEnoughData = dataRows.length >= 2;
    const looksLikeTwoColPairs = isTwoCol && firstColEmptyInData && hasEnoughData;
    let normalizedRows = rows;
    if (looksLikeTwoColPairs) {
      const headerRow1 = padCells(rows[0]);
      const headerRow2 = padCells(rows[1]);
      const col1Header = (headerRow1[0] || headerRow1[1] || '').trim() || '&nbsp;';
      const col2Header = (headerRow2[1] || headerRow2[0] || '').trim() || '&nbsp;';
      normalizedRows = [[col1Header, col2Header]];
      for (let i = 2; i < rows.length - 1; i += 2) {
        const r1 = padCells(rows[i]);
        const r2 = padCells(rows[i + 1]);
        normalizedRows.push([r1[1] || r1[0] || '', r2[1] || r2[0] || '']);
      }
      if (dataRows.length % 2 !== 0) {
        const last = padCells(rows[rows.length - 1]);
        normalizedRows.push([last[1] || last[0] || '', '']);
      }
    } else {
      // Detect N-column grouped table (e.g. Province | Primary Board(s) | Platform | DDF? | Key Note): header = 1 row + (N-1) tab-prefixed rows, then data in groups of N
      const firstRowOneCell = rows.length > 0 && padCells(rows[0]).filter((c) => (c || '').trim()).length <= 1;
      let groupSize = 0;
      for (let N = 8; N >= 3; N--) {
        if (rows.length < N) continue;
        const headerRest = rows.slice(1, N);
        const restAllTabPrefixed = headerRest.every((r) => (padCells(r)[0] || '').replace(/&nbsp;|&#39;/g, '').trim() === '');
        const remainder = (rows.length - N) % N;
        if (firstRowOneCell && headerRest.length === N - 1 && restAllTabPrefixed && remainder === 0 && rows.length > N) {
          groupSize = N;
          break;
        }
      }
      if (groupSize >= 3) {
        const headerCells = [padCells(rows[0])[0] || ''].concat(
          rows.slice(1, groupSize).map((r) => padCells(r)[1] || padCells(r)[0] || '')
        );
        normalizedRows = [headerCells];
        for (let i = groupSize; i < rows.length; i += groupSize) {
          const logicalRow = rows.slice(i, i + groupSize).map((r, j) => {
            const p = padCells(r);
            return j === 0 ? (p[0] || p[1] || '') : (p[1] || p[0] || '');
          });
          normalizedRows.push(logicalRow);
        }
      }
    }
    const finalColCount = Math.max(0, ...normalizedRows.map((r) => r.length));
    function pad(cells) {
      const out = [...cells];
      while (out.length < finalColCount) out.push('');
      return out.slice(0, finalColCount);
    }
    result.push('<table class="doc-table">');
    if (normalizedRows.length > 0) {
      const headerCells = pad(normalizedRows[0]).map((c) => `<th>${c || '&nbsp;'}</th>`).join('');
      result.push('<thead><tr>' + headerCells + '</tr></thead>');
    }
    if (normalizedRows.length > 1) {
      result.push('<tbody>');
      for (let i = 1; i < normalizedRows.length; i++) {
        const cells = pad(normalizedRows[i]).map((c) => `<td>${c || '&nbsp;'}</td>`).join('');
        result.push('<tr>' + cells + '</tr>');
      }
      result.push('</tbody>');
    }
    result.push('</table>');
    tableRows = [];
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    const nextTrimmed = i + 1 < lines.length ? lines[i + 1].trimEnd() : '';
    const nextHasTab = /\t/.test(nextTrimmed) && nextTrimmed.length > 0;
    if (/\t/.test(trimmed) && trimmed.length > 0) {
      tableRows.push(trimmed);
      continue;
    }
    // Line has no tab: if next line has tab, this may be the table header row (e.g. "Organization" before "\tOfficial URL")
    if (trimmed.length > 0 && trimmed.length < 120 && nextHasTab) {
      tableRows.push(trimmed);
      continue;
    }
    flushTable();
    if (!trimmed) {
      result.push('<p class="doc-empty"></p>');
      continue;
    }
    const stripped = trimmed.replace(/^\s*\d+(\.\d+)*\.?\s*/, '').trim();
    const isBullet = stripped !== trimmed || /^\*\s+/.test(trimmed);
    result.push(isBullet ? '<p class="doc-bullet">' + linkify(stripped || trimmed) + '</p>' : '<p>' + linkify(trimmed) + '</p>');
  }
  flushTable();
  return result.join('\n');
}

/**
 * Split text into sections by markdown headings or underline separators.
 */
function parseSectionsFromText(text) {
  const sections = [];
  let t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!t) return sections;

  // Split by long underline lines or by ## / # headings
  const parts = t.split(/(?:\n\s*_{10,}\s*\n|\n(?=#{1,6}\s))/);
  for (let i = 0; i < parts.length; i++) {
    let block = parts[i].trim();
    if (!block) continue;
    const lines = block.split('\n');
    let title = '';
    let contentStart = 0;
    const firstLine = lines[0].trim();
    if (/^#{1,6}\s+/.test(firstLine)) {
      title = firstLine.replace(/^#{1,6}\s+/, '').trim();
      contentStart = 1;
    } else if (firstLine.length > 0 && firstLine.length < 120 && lines.length > 1) {
      title = firstLine;
      contentStart = 1;
    } else {
      title = stripTitleNumbering(firstLine) || `Section ${sections.length + 1}`;
      contentStart = 0;
    }
    const content = lines.slice(contentStart).join('\n').trim();
    if (content.length > 20 || title) {
      sections.push({
        title: stripTitleNumbering(title) || `Section ${sections.length + 1}`,
        content: content || block,
      });
    }
  }
  if (sections.length === 0 && t.length > 0) {
    sections.push({ title: 'Document', content: t });
  }
  return sections;
}

/**
 * Parse markdown by # / ## headings (preserve structure).
 */
function parseMarkdownSections(mdContent) {
  const sections = [];
  const text = String(mdContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const re = /^(#{1,6})\s*(.+)$/gm;
  let lastEnd = 0;
  let lastTitle = '';
  let match;
  while ((match = re.exec(text)) !== null) {
    if (lastTitle) {
      const content = text.slice(lastEnd, match.index).trim();
      if (content.length > 20) sections.push({ title: stripTitleNumbering(lastTitle), content });
    }
    lastTitle = match[2].replace(/\*\*/g, '').trim();
    lastEnd = match.index + match[0].length;
  }
  if (lastTitle) {
    const content = text.slice(lastEnd).trim();
    if (content.length > 20) sections.push({ title: stripTitleNumbering(lastTitle), content });
  }
  if (sections.length === 0 && text.trim().length > 0) {
    sections.push({ title: 'Document', content: text.trim() });
  }
  return sections;
}

export async function parseFile(filePath, mimeType) {
  const ext = (filePath || '').toLowerCase();
  const isPdf = ext.endsWith('.pdf') || (mimeType || '').toLowerCase().includes('pdf');
  const isMd = ext.endsWith('.md') || ext.endsWith('.markdown') || (mimeType || '').toLowerCase().includes('markdown');
  let text = '';
  if (isPdf) {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    text = (data && data.text) ? data.text : '';
  } else {
    text = fs.readFileSync(filePath, 'utf8');
  }
  const sections = isMd ? parseMarkdownSections(text) : parseSectionsFromText(text);
  return sections.map((s) => ({
    title: s.title,
    content: s.content,
    contentHtml: textToHtml(s.content),
  }));
}

export async function parseBuffer(buffer, filename, mimeType) {
  const ext = (filename || '').toLowerCase();
  const isPdf = ext.endsWith('.pdf') || (mimeType || '').toLowerCase().includes('pdf');
  const isMd = ext.endsWith('.md') || ext.endsWith('.markdown') || (mimeType || '').toLowerCase().includes('markdown');
  let text = '';
  if (isPdf) {
    const data = await pdfParse(buffer);
    text = (data && data.text) ? data.text : '';
  } else {
    text = buffer.toString('utf8');
  }
  const sections = isMd ? parseMarkdownSections(text) : parseSectionsFromText(text);
  return sections.map((s) => ({
    title: s.title,
    content: s.content,
    contentHtml: textToHtml(s.content),
  }));
}

export { REGIONS, textToHtml, parseSectionsFromText };
