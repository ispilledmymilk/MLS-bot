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
  'FinCEN & AML',            // (9)
  'State Regulations',       // (10)
  'NYC Regulations',         // (11)
  'Fair Housing & ADA',      // (12)
  'Antitrust & Competition', // (13)
  'AI & AVM',                // (14)
  'Universal Compliance',    // (15)
];

/** Category per file index for Mexico compliance docs */
const MEXICO_CATEGORIES = [
  'Overview & Reference',    // Mexico compliance doc.txt
  'Market Structure',        // (1)
  'Regulatory Bodies',       // (2)
  'AMPI & Regional MLS',     // (3)
  'Portal Landscape',        // (4)
  'Consumer Protection',     // (5)
  'Foreign Ownership',       // (6)
  'Transaction Process',     // (7)
  'Tax Reference',           // (8)
  'State Regulations',       // (9)
  'AML Compliance',          // (10)
  'Data Privacy',            // (11)
  'Regional Notes',          // (12)
  'Universal Compliance',    // (13)
];

/** Category per file index for Portugal compliance docs */
const PORTUGAL_CATEGORIES = [
  'Overview & Reference',    // Portugal compliance doc.txt
  'Market Structure',        // (1)
  'Regulatory Bodies',       // (2)
  'Agent Licensing',         // (3)
  'Portal Landscape',        // (4)
  'Agency Contracts',        // (5)
  'Transaction Process',     // (6)
  'Tax Reference',           // (7)
  'Short-Term Rental',       // (8)
  'AL Containment Zones',    // (9)
  'Privacy & GDPR',          // (10)
  'Key Documents',           // (11)
  'Visa & Residency',        // (12)
  'Universal Compliance',    // (13)
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


async function loadMexicoDocuments() {
  const candidates = [
    path.join(process.cwd(), 'documents', 'mexico'),
    path.join(__dirname, '..', 'documents', 'mexico'),
  ];
  let docsDir = candidates.find((d) => fs.existsSync(d));
  if (!docsDir) {
    console.warn('Document Library: documents/mexico not found. Tried:', candidates.join(', '));
    return;
  }
  const files = fs.readdirSync(docsDir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort((a, b) => {
      if (a === 'Mexico compliance doc.txt') return -1;
      if (b === 'Mexico compliance doc.txt') return 1;
      const numA = a.match(/\((\d+)\)\.txt$/)?.[1];
      const numB = b.match(/\((\d+)\)\.txt$/)?.[1];
      return (Number(numA) || 0) - (Number(numB) || 0);
    });
  const sections = [];
  let sectionIndex = 0;
  for (let i = 0; i < files.length; i++) {
    const category = MEXICO_CATEGORIES[i] || 'Overview & Reference';
    const filePath = path.join(docsDir, files[i]);
    try {
      const parsed = await parseFile(filePath, 'text/plain');
      for (const sec of parsed) {
        sections.push({
          id: `mexico-${sectionIndex}`,
          title: sec.title,
          content: sec.content,
          contentHtml: sec.contentHtml || sec.content,
          category,
        });
        sectionIndex++;
      }
    } catch (err) {
      console.warn('Could not load Mexico doc:', files[i], err.message);
    }
  }
  store.mexico.sections = sections;
  store.mexico.fullText = sections.map((s) => `${s.title}\n\n${s.content}`).join('\n\n').slice(0, 120000);
  console.log(`Loaded ${sections.length} sections from ${files.length} Mexico compliance document(s).`);
}

async function loadPortugalDocuments() {
  const candidates = [
    path.join(process.cwd(), 'documents', 'portugal'),
    path.join(__dirname, '..', 'documents', 'portugal'),
  ];
  let docsDir = candidates.find((d) => fs.existsSync(d));
  if (!docsDir) {
    console.warn('Document Library: documents/portugal not found. Tried:', candidates.join(', '));
    return;
  }
  const files = fs.readdirSync(docsDir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort((a, b) => {
      if (a === 'Portugal compliance doc.txt') return -1;
      if (b === 'Portugal compliance doc.txt') return 1;
      const numA = a.match(/\((\d+)\)\.txt$/)?.[1];
      const numB = b.match(/\((\d+)\)\.txt$/)?.[1];
      return (Number(numA) || 0) - (Number(numB) || 0);
    });
  const sections = [];
  let sectionIndex = 0;
  for (let i = 0; i < files.length; i++) {
    const category = PORTUGAL_CATEGORIES[i] || 'Overview & Reference';
    const filePath = path.join(docsDir, files[i]);
    try {
      const parsed = await parseFile(filePath, 'text/plain');
      for (const sec of parsed) {
        sections.push({
          id: `portugal-${sectionIndex}`,
          title: sec.title,
          content: sec.content,
          contentHtml: sec.contentHtml || sec.content,
          category,
        });
        sectionIndex++;
      }
    } catch (err) {
      console.warn('Could not load Portugal doc:', files[i], err.message);
    }
  }
  store.portugal.sections = sections;
  store.portugal.fullText = sections.map((s) => `${s.title}\n\n${s.content}`).join('\n\n').slice(0, 120000);
  console.log(`Loaded ${sections.length} sections from ${files.length} Portugal compliance document(s).`);
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

const STOP_WORDS = new Set([
  'what','the','are','is','how','does','do','did','a','an','in','on','at','of',
  'for','and','or','to','by','with','from','about','apply','applies','should',
  'can','be','been','have','has','had','that','this','these','those','which',
  'there','their','they','when','where','why','who','will','would','could',
  'may','might','must','shall','need','get','use','used','make','made','any',
  'all','its','it','my','your','our','us','we','me','he','she','his','her',
]);

function getBestSectionsForQuery(query, region, maxChars = 15000) {
  const s = store[region];
  if (!s || !s.sections || s.sections.length === 0) return [];
  const q = String(query || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
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
  if (top.length === 0) return s.sections.slice(0, 3).map((sec) => sec.content.slice(0, maxChars));
  let total = 0;
  const out = [];
  for (const sec of top) {
    if (total >= maxChars) break;
    const chunk = sec.content.slice(0, maxChars - total);
    out.push(chunk);
    total += chunk.length;
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

const DOC_SYSTEM = `You are a Real Estate Feeds Compliance Expert. Answer questions using only the provided documentation. Be clear and concise. If the answer is not in the documentation, say "This is not covered in the provided documentation." Do not make up policy details.`;

function sseError(res, msg) {
  res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

app.post('/api/chat', async (req, res) => {
  const { message, region } = req.body || {};

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  if (!message || typeof message !== 'string' || !message.trim()) {
    return sseError(res, 'Please enter a question.');
  }

  const r = (region || '').toLowerCase();
  const isAll = r === 'all';
  if (!isAll && !REGIONS.includes(r)) {
    return sseError(res, 'Please select a region (Canada, USA, Portugal, or Mexico).');
  }

  const regionsToSearch = isAll
    ? REGIONS.filter((reg) => store[reg] && store[reg].fullText.trim())
    : [r];

  if (!isAll && (!store[r] || !store[r].fullText.trim())) {
    return sseError(res, `No documentation loaded for ${r.toUpperCase()}.`);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) {
    return sseError(res, 'AI is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.');
  }

  const allParts = regionsToSearch.flatMap((reg) => getBestSectionsForQuery(message.trim(), reg, 12000));
  const context = allParts.join('\n\n').slice(0, 40000);
  const prompt = `${DOC_SYSTEM}\n\n--- DOCUMENTATION ---\n${context}\n\n--- QUESTION ---\n${message.trim()}`;

  try {
    if (geminiKey && geminiKey.trim()) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey.trim());
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
      const result = await model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const text = chunk.text ? chunk.text() : '';
        if (text) res.write(`data: ${JSON.stringify(text)}\n\n`);
      }
    } else {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: openaiKey.trim() });
      const stream = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        stream: true,
      });
      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content || '';
        if (text) res.write(`data: ${JSON.stringify(text)}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message || String(err) })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer(port) {
  await loadCanadaDocuments();
  await loadUsaDocuments();
  await loadMexicoDocuments();
  await loadPortugalDocuments();
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
