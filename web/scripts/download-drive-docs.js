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
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }
  const credentials = JSON.parse(raw);
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
  const auth = buildAuth();
  const drive = google.drive({ version: 'v3', auth });

  let hadError = false;

  for (const { region, envVar, localDir } of REGIONS) {
    const folderId = process.env[envVar];
    if (!folderId) {
      console.warn(`[${region}] Skipping — ${envVar} is not set.`);
      continue;
    }
    try {
      await syncRegion(drive, localDir || region, folderId, region);
    } catch (err) {
      console.error(`[${region}] Error: ${err.message}`);
      hadError = true;
    }
  }

  if (hadError) process.exit(1);
  console.log('All regions synced.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
