/**
 * Downloads compliance PDFs from Google Drive into documents/{region}/.
 * Existing local files not present in Drive are removed to keep in sync.
 *
 * Required environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON string of a service account key
 *   DRIVE_FOLDER_CANADA          — Google Drive folder ID for Canada docs
 *   DRIVE_FOLDER_USA             — Google Drive folder ID for USA docs
 *   DRIVE_FOLDER_MEXICO          — Google Drive folder ID for Mexico docs
 *   DRIVE_FOLDER_PUERTO_RICO     — Google Drive folder ID for Puerto Rico docs
 *
 * Usage (from repo root or web/):
 *   node web/scripts/download-drive-docs.js
 */

import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'documents');

// ── Auth ──────────────────────────────────────────────────────────────────────

function buildAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is missing or empty. Add it under Repo → Settings → Secrets and variables → Actions → Secrets.'
    );
  }
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (e) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${e.message}`);
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

// ── Region config ─────────────────────────────────────────────────────────────

const REGIONS = [
  { region: 'canada',      envVar: 'DRIVE_FOLDER_CANADA',       localDir: 'canada' },
  { region: 'usa',         envVar: 'DRIVE_FOLDER_USA',          localDir: 'usa' },
  { region: 'mexico',      envVar: 'DRIVE_FOLDER_MEXICO',       localDir: 'mexico' },
  { region: 'puerto_rico', envVar: 'DRIVE_FOLDER_PUERTO_RICO',  localDir: 'puerto rico' },
];

function logConfigSummary() {
  console.log('--- Drive sync config (values hidden) ---');
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  console.log(
    'GOOGLE_SERVICE_ACCOUNT_JSON:',
    raw && String(raw).trim() ? `set (${String(raw).trim().length} chars)` : 'MISSING'
  );
  let anyFolder = false;
  for (const { envVar } of REGIONS) {
    const v = process.env[envVar];
    const ok = !!(v && String(v).trim());
    if (ok) anyFolder = true;
    console.log(`${envVar}:`, ok ? 'set' : 'not set');
  }
  console.log('------------------------------------------');
  return anyFolder;
}

function formatDriveError(err) {
  const msg = err && err.message ? err.message : String(err);
  const data = err && err.response && err.response.data;
  if (data) {
    try {
      return `${msg} | API: ${JSON.stringify(data)}`;
    } catch {
      return `${msg} | API: (unserializable)`;
    }
  }
  return msg;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Lists all files directly inside a Drive folder (non-recursive).
 * Returns only files (not sub-folders).
 */
async function listDriveFiles(drive, folderId) {
  const files = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 200,
      pageToken: pageToken || undefined,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return files;
}

/**
 * Downloads a Drive file to a local path.
 * Native files (PDFs, txt, etc.) are downloaded as-is.
 * Google Docs are exported as plain text; Google Sheets as CSV.
 */
async function downloadFile(drive, file, destPath) {
  const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
  const isGoogleSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';

  let response;

  if (isGoogleDoc) {
    response = await drive.files.export(
      { fileId: file.id, mimeType: 'text/plain' },
      { responseType: 'stream' }
    );
  } else if (isGoogleSheet) {
    response = await drive.files.export(
      { fileId: file.id, mimeType: 'text/csv' },
      { responseType: 'stream' }
    );
  } else {
    response = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'stream' }
    );
  }

  const dest = fs.createWriteStream(destPath);
  await pipeline(Readable.from(response.data), dest);
}

/**
 * Resolves the local filename for a Drive file.
 * Google Docs → .txt  |  Google Sheets → .csv  |  everything else → as-is.
 */
function localFilename(file) {
  if (file.mimeType === 'application/vnd.google-apps.document') {
    return file.name.endsWith('.txt') ? file.name : `${file.name}.txt`;
  }
  if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    return file.name.endsWith('.csv') ? file.name : `${file.name}.csv`;
  }
  return file.name;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function syncRegion(drive, diskFolderName, folderId, logLabel = diskFolderName) {
  const localDir = path.join(DOCS_ROOT, diskFolderName);
  fs.mkdirSync(localDir, { recursive: true });

  console.log(`[${logLabel}] Listing files in folder ${folderId}…`);
  const driveFiles = await listDriveFiles(drive, folderId);
  console.log(`[${logLabel}] Found ${driveFiles.length} file(s) in Drive.`);

  const driveNames = new Set();

  for (const file of driveFiles) {
    const filename = localFilename(file);
    driveNames.add(filename);
    const destPath = path.join(localDir, filename);
    console.log(`[${logLabel}] Downloading "${filename}"…`);
    await downloadFile(drive, file, destPath);
  }

  // Remove local files that are no longer in Drive
  const localFiles = fs.readdirSync(localDir).filter((f) =>
    /\.(txt|md|markdown|pdf|csv)$/i.test(f)
  );
  for (const localFile of localFiles) {
    if (!driveNames.has(localFile)) {
      fs.unlinkSync(path.join(localDir, localFile));
      console.log(`[${logLabel}] Removed stale file "${localFile}".`);
    }
  }

  console.log(`[${logLabel}] Sync complete.`);
}

async function main() {
  const anyFolder = logConfigSummary();
  if (!anyFolder) {
    console.error(
      'No DRIVE_FOLDER_* variables are set. In GitHub: Settings → Actions → Variables, set at least one of:\n' +
        '  DRIVE_FOLDER_CANADA, DRIVE_FOLDER_USA, DRIVE_FOLDER_MEXICO, DRIVE_FOLDER_PUERTO_RICO\n' +
        '(If you used DRIVE_FOLDER_PORTUGAL before, rename it to DRIVE_FOLDER_PUERTO_RICO.)'
    );
    process.exit(1);
  }

  const auth = buildAuth();
  const drive = google.drive({ version: 'v3', auth });

  let hadError = false;
  let syncedCount = 0;

  for (const { region, envVar, localDir } of REGIONS) {
    const folderId = process.env[envVar];
    if (!folderId || !String(folderId).trim()) {
      console.warn(`[${region}] Skipping — ${envVar} is not set.`);
      continue;
    }
    try {
      await syncRegion(drive, localDir || region, folderId.trim(), region);
      syncedCount += 1;
    } catch (err) {
      console.error(`[${region}] Error: ${formatDriveError(err)}`);
      hadError = true;
    }
  }

  if (hadError) {
    console.error(
      '\nDrive sync failed for one or more regions. Typical fixes:\n' +
        '  • Share each Drive folder with the service account email from your JSON key (Viewer is enough).\n' +
        '  • Use the folder ID from the Drive URL (the segment after /folders/).\n' +
        '  • Enable the Google Drive API for the GCP project that owns the service account.'
    );
    process.exit(1);
  }
  console.log(`All regions synced (${syncedCount} folder(s)).`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
