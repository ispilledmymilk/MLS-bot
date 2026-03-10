/**
 * Google OAuth with domain restriction for Electron.
 * Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_DOMAIN
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const REDIRECT_PORT = 3099;
const REDIRECT_PATH = '/oauth2/callback';
const SESSION_FILE = 'auth-session.json';

function getSessionPath() {
  return path.join(app.getPath('userData'), SESSION_FILE);
}

function loadSession() {
  try {
    const p = getSessionPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data && data.email && data.expiresAt && Date.now() < data.expiresAt) {
        return data;
      }
    }
  } catch (_) {}
  return null;
}

function saveSession(user) {
  try {
    const p = getSessionPath();
    const data = {
      email: user.email,
      name: user.name || user.email,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    fs.writeFileSync(p, JSON.stringify(data), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function clearSession() {
  try {
    const p = getSessionPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(verifier).digest();
  const challenge = hash.toString('base64url');
  return { verifier, challenge };
}

function startCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname === REDIRECT_PATH) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          error
            ? `<html><body><p>Sign-in failed: ${error}</p><script>window.close();</script></body></html>`
            : '<html><body><p>Sign-in successful. You can close this window.</p><script>window.close();</script></body></html>'
        );
        server.close();
        resolve({ code, error });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(REDIRECT_PORT, '127.0.0.1', () => {});
    server.on('error', (err) => reject(err));
  });
}

function openAuthWindow(authUrl) {
  return new Promise((resolve) => {
    const authWin = new BrowserWindow({
      width: 500,
      height: 600,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    authWin.loadURL(authUrl);
    authWin.on('closed', () => resolve({ closed: true }));
    authWin.webContents.on('will-redirect', (event, url) => {
      try {
        const u = new URL(url);
        if (u.hostname === 'localhost' && u.port === String(REDIRECT_PORT) && u.pathname === REDIRECT_PATH) {
          event.preventDefault();
        }
      } catch (_) {}
    });
  });
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(body).toString();
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (_) {
            resolve({ error: buf });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch (_) {
          reject(new Error(buf || 'Invalid response'));
        }
      });
    }).on('error', reject);
  });
}

async function exchangeCodeForTokens(code, verifier, clientId, clientSecret) {
  const redirectUri = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;
  const res = await httpsPost('https://oauth2.googleapis.com/token', {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  if (res.error) {
    throw new Error(res.error_description || res.error || 'Token exchange failed');
  }
  return res;
}

function getUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: 'www.googleapis.com',
        path: '/oauth2/v2/userinfo',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (_) {
            reject(new Error(buf || 'Invalid response'));
          }
        });
      }
    );
    req.on('error', reject);
  });
}

async function performGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const allowedDomain = (process.env.ALLOWED_DOMAIN || '').toLowerCase().trim();

  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' };
  }
  if (!allowedDomain) {
    return { ok: false, error: 'Domain restriction not configured. Set ALLOWED_DOMAIN (e.g. company.com).' };
  }

  const { verifier, challenge } = generatePKCE();
  const redirectUri = `http://127.0.0.1:${REDIRECT_PORT}${REDIRECT_PATH}`;
  const scopes = encodeURIComponent('openid email profile');
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scopes}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;

  const serverPromise = startCallbackServer();
  openAuthWindow(authUrl);

  const { code, error, closed } = await serverPromise;
  if (closed || error) {
    return { ok: false, error: error || 'Sign-in was cancelled.' };
  }
  if (!code) {
    return { ok: false, error: 'No authorization code received.' };
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, verifier, clientId, clientSecret);
  } catch (err) {
    return { ok: false, error: err.message || 'Token exchange failed.' };
  }

  let userInfo;
  try {
    userInfo = await getUserInfo(tokens.access_token);
  } catch (err) {
    return { ok: false, error: 'Could not fetch user info.' };
  }

  const email = (userInfo.email || '').toLowerCase().trim();
  const domain = email.includes('@') ? email.split('@')[1] : '';

  if (domain !== allowedDomain) {
    return {
      ok: false,
      error: `Access denied. Only @${allowedDomain} accounts are allowed. You signed in with ${email || 'unknown'}.`,
    };
  }

  saveSession({
    email,
    name: userInfo.name || userInfo.email || email,
  });

  return {
    ok: true,
    user: {
      email,
      name: userInfo.name || userInfo.email || email,
    },
  };
}

module.exports = {
  loadSession,
  saveSession,
  clearSession,
  performGoogleAuth,
  getSessionPath,
};
