/**
 * Generates static JSON fixture files for each compliance region.
 * Output mirrors the shape of GET /api/sections?region=<region>.
 *
 * Usage (from the repo root or from web/):
 *   node web/scripts/generate-fixtures.js
 *
 * Output:
 *   web/test/fixtures/canada.json          — combined Canada fixture
 *   web/test/fixtures/canada/<file>.json   — one file per Canada document
 *   web/test/fixtures/usa.json
 *   web/test/fixtures/mexico.json
 *   web/test/fixtures/portugal.json
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseFile } from '../docs-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(WEB_DIR, 'test', 'fixtures');

// ── Category maps (kept in sync with server.js) ──────────────────────────────

const CANADA_CATEGORIES = [
  'Overview & Reference',
  'National & CREA DDF',
  'Ontario',
  'Ontario',
  'British Columbia',
  'British Columbia',
  'Alberta',
  'Alberta',
  'Quebec',
  'Quebec',
  'Prairie Provinces',
  'Prairie Provinces',
  'Prairie Provinces',
  'Atlantic Provinces',
  'Atlantic Provinces',
  'Atlantic Provinces',
  'Atlantic Provinces',
  'Territories',
  'Universal Compliance',
  'Privacy & CASL',
  'Privacy & CASL',
  'Technical & RESO',
  'AI & Accessibility',
  'AI & Accessibility',
  'Competition Law',
  'Vendors & Agreements',
  'Commercial Listings',
];

const USA_CATEGORIES = [
  'Overview & Reference',
  'National Framework',
  'IDX Policy',
  'VOW Policy',
  'Clear Cooperation',
  'Technical & RESO',
  'Regional MLS',
  'Privacy Law',
  'Email & CAN-SPAM',
  'FinCEN & AML',
  'State Regulations',
  'NYC Regulations',
  'Fair Housing & ADA',
  'Antitrust & Competition',
  'AI & AVM',
  'Universal Compliance',
];

const MEXICO_CATEGORIES = [
  'Overview & Reference',
  'Market Structure',
  'Regulatory Bodies',
  'AMPI & Regional MLS',
  'Portal Landscape',
  'Consumer Protection',
  'Foreign Ownership',
  'Transaction Process',
  'Tax Reference',
  'State Regulations',
  'AML Compliance',
  'Data Privacy',
  'Regional Notes',
  'Universal Compliance',
];

const PORTUGAL_CATEGORIES = [
  'Overview & Reference',
  'Market Structure',
  'Regulatory Bodies',
  'Agent Licensing',
  'Portal Landscape',
  'Agency Contracts',
  'Transaction Process',
  'Tax Reference',
  'Short-Term Rental',
  'AL Containment Zones',
  'Privacy & GDPR',
  'Key Documents',
  'Visa & Residency',
  'Universal Compliance',
];

// ── Region config ─────────────────────────────────────────────────────────────

const REGIONS = [
  {
    region: 'canada',
    folder: 'canada',
    baseFile: 'CANADIAN MLS.txt',
    categories: CANADA_CATEGORIES,
  },
  {
    region: 'usa',
    folder: 'usa',
    baseFile: 'USA compliance doc.txt',
    categories: USA_CATEGORIES,
  },
  {
    region: 'mexico',
    folder: 'mexico',
    baseFile: 'Mexico compliance doc.txt',
    categories: MEXICO_CATEGORIES,
  },
  {
    region: 'portugal',
    folder: 'portugal',
    baseFile: 'Portugal compliance doc.txt',
    categories: PORTUGAL_CATEGORIES,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveDocsDir(folder) {
  const candidates = [
    path.join(process.cwd(), 'documents', folder),
    path.join(WEB_DIR, '..', 'documents', folder),
  ];
  return candidates.find((d) => fs.existsSync(d)) || null;
}

function sortFiles(files, baseFile) {
  return [...files].sort((a, b) => {
    if (a === baseFile) return -1;
    if (b === baseFile) return 1;
    const numA = a.match(/\((\d+)\)\.(txt|md|pdf)$/i)?.[1];
    const numB = b.match(/\((\d+)\)\.(txt|md|pdf)$/i)?.[1];
    return (Number(numA) || 0) - (Number(numB) || 0);
  });
}

function mimeFor(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown';
  return 'text/plain';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function generateFixture({ region, folder, baseFile, categories }) {
  const docsDir = resolveDocsDir(folder);
  if (!docsDir) {
    console.error(`[${region}] documents/${folder} not found — skipping.`);
    return;
  }

  const allFiles = fs.readdirSync(docsDir).filter((f) =>
    /\.(txt|md|markdown|pdf)$/i.test(f)
  );
  const files = sortFiles(allFiles, baseFile);

  const sections = [];
  let sectionIndex = 0;

  for (let i = 0; i < files.length; i++) {
    const category = categories[i] || 'Overview & Reference';
    const filePath = path.join(docsDir, files[i]);
    try {
      const parsed = await parseFile(filePath, mimeFor(files[i]));
      for (const sec of parsed) {
        sections.push({
          id: `${region}-${sectionIndex}`,
          title: sec.title,
          contentHtml: sec.contentHtml || sec.content,
          category,
        });
        sectionIndex++;
      }
    } catch (err) {
      console.warn(`[${region}] Could not parse ${files[i]}: ${err.message}`);
    }
  }

  const payload = { ok: true, sections };
  const outPath = path.join(FIXTURES_DIR, `${region}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[${region}] Wrote ${sections.length} sections → ${path.relative(process.cwd(), outPath)}`);
}

async function generateCanadaIndividualFixtures() {
  const folder = 'canada';
  const baseFile = 'CANADIAN MLS.txt';
  const outDir = path.join(FIXTURES_DIR, 'canada');
  fs.mkdirSync(outDir, { recursive: true });

  const docsDir = resolveDocsDir(folder);
  if (!docsDir) {
    console.error('[canada/individual] documents/canada not found — skipping.');
    return;
  }

  const allFiles = fs.readdirSync(docsDir).filter((f) =>
    /\.(txt|md|markdown|pdf)$/i.test(f)
  );
  const files = sortFiles(allFiles, baseFile);

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const category = CANADA_CATEGORIES[i] || 'Overview & Reference';
    const filePath = path.join(docsDir, filename);
    try {
      const parsed = await parseFile(filePath, mimeFor(filename));
      const sections = parsed.map((sec, idx) => ({
        id: `canada-${filename.replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase()}-${idx}`,
        title: sec.title,
        contentHtml: sec.contentHtml || sec.content,
        category,
      }));
      const payload = { ok: true, file: filename, category, sections };
      const outName = filename.replace(/\.[^.]+$/, '') + '.json';
      const outPath = path.join(outDir, outName);
      fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[canada/${filename}] Wrote ${sections.length} section(s) → ${path.relative(process.cwd(), outPath)}`);
    } catch (err) {
      console.warn(`[canada/individual] Could not parse ${filename}: ${err.message}`);
    }
  }
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  for (const config of REGIONS) {
    await generateFixture(config);
  }
  await generateCanadaIndividualFixtures();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
