/**
 * Web server: upload compliance docs (USA, Portugal, Mexico), browse DOCS, chat with bot.
 * Requires GEMINI_API_KEY or OPENAI_API_KEY in .env for AI answers.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { parseBuffer, parseFile, REGIONS } from './docs-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const store = {
  usa: { sections: [], fullText: '' },
  portugal: { sections: [], fullText: '' },
  mexico: { sections: [], fullText: '' },
  canada: { sections: [], fullText: '' },
};

/** Category per file index for Canadian MLS docs (sorted: CANADIAN MLS.txt, then (1)..(25)) */
const CANADA_CATEGORIES = [
  'Overview & Reference',      // CANADIAN MLS.txt
  'National & CREA DDF',      // (1)
  'Ontario',                  // (2)
  'Ontario',                  // (3) RECO
  'British Columbia',         // (4)
  'British Columbia',         // (5) BCFSA
  'Alberta',                  // (6)
  'Alberta',                  // (7) RECA
  'Quebec',                   // (8)
  'Quebec',                   // (9) OACIQ
  'Prairie Provinces',        // (10)
  'Prairie Provinces',        // (11) SREC
  'Prairie Provinces',        // (12) MSC
  'Atlantic Provinces',       // (13)
  'Atlantic Provinces',       // (14) FCNB
  'Atlantic Provinces',       // (15) NSREC
  'Atlantic Provinces',      // (16) PEI & NL
  'Territories',              // (17)
  'Universal Compliance',     // (18)
  'Privacy & CASL',           // (19)
  'Privacy & CASL',           // (20) CASL
  'Technical & RESO',         // (21)
  'AI & Accessibility',       // (22)
  'AI & Accessibility',      // (23) Accessibility
  'Competition Law',          // (24)
  'Vendors & Agreements',     // (25)
  'Commercial Listings',      // (26)
];

/** Category per file index for USA MLS compliance docs */
const USA_CATEGORIES = [
  'Overview & Reference',    // USA compliance doc.txt
  'National Framework',      // (1)
  'IDX Policy',              // (2)
  'VOW Policy',              // (3)
  'Clear Cooperation',       // (4)
  'Technical & RESO',        // (5)
  'Regional MLS',            // (6)
  'Privacy Law',             // (7)
  'Email & CAN-SPAM',        // (8)
  'Fair Housing & ADA',      // (9)
  'Antitrust & Competition', // (10)
  'AI & AVM',                // (11)
  'Universal Compliance',    // (12)
];

async function loadUsaDocuments() {
  const candidates = [
    path.join(process.cwd(), 'documents', 'usa'),
    path.join(__dirname, '..', 'documents', 'usa'),
  ];
  let docsDir = candidates.find((d) => fs.existsSync(d));
  if (!docsDir) {
    console.warn('Document Library: documents/usa not found. Tried:', candidates.join(', '));
    return;
  }
  const files = fs.readdirSync(docsDir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort((a, b) => {
      if (a === 'USA compliance doc.txt') return -1;
      if (b === 'USA compliance doc.txt') return 1;
      const numA = a.match(/\((\d+)\)\.txt$/)?.[1];
      const numB = b.match(/\((\d+)\)\.txt$/)?.[1];
      return (Number(numA) || 0) - (Number(numB) || 0);
    });
  const sections = [];
  let sectionIndex = 0;
  for (let i = 0; i < files.length; i++) {
    const category = USA_CATEGORIES[i] || 'Overview & Reference';
    const filePath = path.join(docsDir, files[i]);
    try {
      const parsed = await parseFile(filePath, 'text/plain');
      for (const sec of parsed) {
        sections.push({
          id: `usa-${sectionIndex}`,
          title: sec.title,
          content: sec.content,
          contentHtml: sec.contentHtml || sec.content,
          category,
        });
        sectionIndex++;
      }
    } catch (err) {
      console.warn('Could not load USA doc:', files[i], err.message);
    }
  }
  store.usa.sections = sections;
  store.usa.fullText = sections.map((s) => `${s.title}\n\n${s.content}`).join('\n\n').slice(0, 120000);
  console.log(`Loaded ${sections.length} sections from ${files.length} USA compliance document(s).`);
}


async function loadCanadaDocuments() {
  const candidates = [
    path.join(process.cwd(), 'documents', 'canada'),
    path.join(__dirname, '..', 'documents', 'canada'),
  ];
  let docsDir = candidates.find((d) => fs.existsSync(d));
  if (!docsDir) {
    console.warn('Document Library: documents/canada not found. Tried:', candidates.join(', '));
    return;
  }
  const files = fs.readdirSync(docsDir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort((a, b) => {
      if (a === 'CANADIAN MLS.txt') return -1;
      if (b === 'CANADIAN MLS.txt') return 1;
      const numA = a.match(/\((\d+)\)\.txt$/)?.[1];
      const numB = b.match(/\((\d+)\)\.txt$/)?.[1];
      return (Number(numA) || 0) - (Number(numB) || 0);
    });
  const sections = [];
  let sectionIndex = 0;
  for (let i = 0; i < files.length; i++) {
    const category = CANADA_CATEGORIES[i] || 'Overview & Reference';
    const filePath = path.join(docsDir, files[i]);
    try {
      const parsed = await parseFile(filePath, 'text/plain');
      for (const sec of parsed) {
        sections.push({
          id: `canada-${sectionIndex}`,
          title: sec.title,
          content: sec.content,
          contentHtml: sec.contentHtml || sec.content,
          category,
        });
        sectionIndex++;
      }
    } catch (err) {
      console.warn('Could not load Canada doc:', files[i], err.message);
    }
  }
  store.canada.sections = sections;
  store.canada.fullText = sections.map((s) => `${s.title}\n\n${s.content}`).join('\n\n').slice(0, 120000);
  console.log(`Loaded ${sections.length} sections from ${files.length} Canadian MLS document(s).`);
}

function buildFullText(region) {
  const s = store[region];
  if (!s || !s.sections) return '';
  const text = s.sections.map((sec) => `${sec.title}\n\n${sec.content}`).join('\n\n');
  return text.slice(0, 120000);
}

function getBestSectionsForQuery(query, region, maxChars = 15000) {
  const s = store[region];
  if (!s || !s.sections || s.sections.length === 0) return [];
  const q = String(query || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  if (q.length === 0) return s.sections.slice(0, 3).map((sec) => sec.content);
  const scored = s.sections.map((sec) => {
    const titleLower = (sec.title || '').toLowerCase();
    const contentLower = (sec.content || '').toLowerCase();
    let score = 0;
    q.forEach((w) => {
      if (titleLower.includes(w)) score += 2;
      if (contentLower.includes(w)) score += 1;
    });
    return { sec, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((x) => x.score > 0).slice(0, 5).map((x) => x.sec);
  if (top.length === 0) return s.sections.slice(0, 3).map((sec) => sec.content);
  let total = 0;
  const out = [];
  for (const sec of top) {
    if (total + sec.content.length > maxChars) break;
    out.push(sec.content);
    total += sec.content.length;
  }
  return out;
}

app.get('/api/regions', (_req, res) => {
  res.json({ ok: true, regions: REGIONS });
});

app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  const region = (req.body.region || '').toLowerCase();
  if (!REGIONS.includes(region)) {
    return res.status(400).json({ ok: false, error: 'Invalid region. Use usa, portugal, or mexico.' });
  }
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ ok: false, error: 'No files uploaded.' });
  }
  try {
    const allSections = [];
    const seen = new Set();
    for (const file of files) {
      const sections = await parseBuffer(file.buffer, file.originalname, file.mimetype);
      for (const sec of sections) {
        const norm = (sec.title || '').trim().toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        allSections.push({
          id: `section-${allSections.length}`,
          title: sec.title,
          content: sec.content,
          contentHtml: sec.contentHtml || sec.content,
        });
      }
    }
    store[region].sections = allSections;
    store[region].fullText = buildFullText(region);
    res.json({ ok: true, region, count: allSections.length });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get('/api/sections', (req, res) => {
  const region = (req.query.region || '').toLowerCase();
  if (!REGIONS.includes(region)) {
    return res.status(400).json({ ok: false, error: 'Invalid region.', sections: [] });
  }
  const s = store[region];
  const sections = (s && s.sections)
    ? s.sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        contentHtml: sec.contentHtml,
        category: sec.category || undefined,
      }))
    : [];
  res.json({ ok: true, sections });
});

const DOC_SYSTEM = `You are a Real Estate Feeds Compliance Expert. The user will ask questions related to compliance information in Canada, USA, Portugal or Mexico. Depending on the question asked I want you to answer their questions only using the documentation in the documents folder. Be clear and concise. If the answer is not in the documentation, say "This is not covered in the provided documentation." Do not make up policy details.`;
async function callGemini(message, context, apiKey) {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
    const prompt = `--- DOCUMENTATION ---\n${context}\n\n--- QUESTION ---\n${message}`;
    const result = await model.generateContent(prompt);
    const text = result.response && result.response.text ? result.response.text() : '';
    return { ok: true, text: text.trim() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function callOpenAI(message, context, apiKey) {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: apiKey.trim() });
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: DOC_SYSTEM },
        { role: 'user', content: `--- DOCUMENTATION ---\n${context}\n\n--- QUESTION ---\n${message}` },
      ],
      max_tokens: 800,
    });
    const text = res.choices?.[0]?.message?.content;
    return { ok: true, text: (text || '').trim() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

app.post('/api/chat', async (req, res) => {
  const { message, region } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.json({ ok: false, answer: 'Please enter a question.', links: [] });
  }
  const r = (region || '').toLowerCase();
  if (!REGIONS.includes(r)) {
    return res.json({ ok: false, answer: 'Please select a region (Canada, USA, Portugal, or Mexico).', links: [] });
  }
  const s = store[r];
  const fullText = s && s.fullText ? s.fullText : '';
  if (!fullText.trim()) {
    return res.json({
      ok: true,
      answer: `No documentation loaded for ${r.toUpperCase()}. Upload documents from the Upload page first.`,
      links: [],
    });
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) {
    return res.json({
      ok: true,
      answer: 'AI is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY in the server .env file.',
      links: [],
    });
  }
  const contextParts = getBestSectionsForQuery(message.trim(), r);
  const context = contextParts.length > 0 ? contextParts.join('\n\n') : fullText.slice(0, 80000);
  let result;
  if (geminiKey && geminiKey.trim()) {
    result = await callGemini(message.trim(), context, geminiKey);
    if (!result.ok && openaiKey && openaiKey.trim()) {
      result = await callOpenAI(message.trim(), context, openaiKey);
    }
  } else {
    result = await callOpenAI(message.trim(), context, openaiKey);
  }
  if (result.ok) {
    return res.json({ ok: true, answer: result.text, links: [] });
  }
  return res.json({ ok: true, answer: 'Error: ' + (result.error || 'Could not get a response.'), links: [] });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer(port) {
  await loadCanadaDocuments();
  await loadUsaDocuments();
  const server = app.listen(port, () => {
    console.log(`Compliance bot web app: http://localhost:${server.address().port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 65535) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
