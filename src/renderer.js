/**
 * Chat UI: built-in knowledge (IPC). Google Auth required (domain-restricted).
 */

const form = document.getElementById('chat-form');
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesEl = document.getElementById('messages');
const pagesBtn = document.getElementById('pages-btn');
const pagesSection = document.getElementById('pages-section');
const chatContainer = document.querySelector('.chat-container');
const pagesList = document.getElementById('pages-list');
const docSectionTitle = document.getElementById('doc-section-title');
const docContent = document.getElementById('doc-content');

let knowledge = null;
let docSections = [];
let currentSectionId = null;

const STORAGE_THEME = 'compliance-bot-theme';

function loadStoredSettings() {
  try {
    const theme = localStorage.getItem(STORAGE_THEME);
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  } catch (_) {}
}

const themeBtn = document.getElementById('theme-btn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeBtn.textContent = isDark ? '☀️' : '🌙';
    try { localStorage.setItem(STORAGE_THEME, isDark ? 'light' : 'dark'); } catch (_) {}
  });
}

async function loadKnowledge() {
  if (knowledge) return knowledge;
  if (!window.electronAPI || typeof window.electronAPI.getKnowledge !== 'function') {
    knowledge = { defaultAnswer: 'Knowledge base not loaded. Check that the app started correctly.', sections: [] };
    return knowledge;
  }
  try {
    knowledge = await window.electronAPI.getKnowledge();
    if (!knowledge || typeof knowledge !== 'object') {
      knowledge = { defaultAnswer: 'Knowledge base failed to load.', sections: [] };
    }
    if (!Array.isArray(knowledge.sections)) knowledge.sections = [];
  } catch (err) {
    console.error('loadKnowledge error:', err);
    knowledge = { defaultAnswer: 'Failed to load knowledge. ' + (err && err.message ? err.message : String(err)), sections: [] };
  }
  return knowledge;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreQuery(queryNorm, keywords) {
  let score = 0;
  const terms = queryNorm.split(' ');
  for (const kw of keywords) {
    for (const t of terms) {
      if (t.length >= 2 && kw.includes(t)) score += 2;
      if (kw.includes(t) || t.includes(kw)) score += 1;
    }
  }
  return score;
}

function findBestSection(query) {
  if (!knowledge || !knowledge.sections) return null;
  const queryNorm = normalize(query);
  let best = null;
  let bestScore = 0;
  for (const section of knowledge.sections) {
    const s = scoreQuery(queryNorm, section.keywords);
    if (s > bestScore) {
      bestScore = s;
      best = section;
    }
  }
  return bestScore > 0 ? best : null;
}

function renderMarkdownLite(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function linkifyHtml(html) {
  const fullUrl = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;
  const bareDomain = /\b((?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.)+(?:ca|com|org|net)(?:\/[^\s<>")\]]*)?)/g;
  let out = String(html || '')
    .replace(fullUrl, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const anchorBlock = /<a\s[^>]*>[\s\S]*?<\/a>/gi;
  const parts = out.split(anchorBlock);
  const anchors = out.match(anchorBlock) || [];
  out = parts.map((part, i) => {
    const linkified = part.replace(bareDomain, (m) => `<a href="https://${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
    return i < anchors.length ? linkified + anchors[i] : linkified;
  }).join('');
  return out;
}

function sanitizeHtml(html) {
  return String(html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

function appendMessage(role, contentHtml, links = []) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.setAttribute('data-role', role);

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'U' : '?';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const p = document.createElement('p');
  p.innerHTML = contentHtml;
  bubble.appendChild(p);

  if (links.length > 0) {
    const linksDiv = document.createElement('div');
    linksDiv.className = 'links';
    const title = document.createElement('div');
    title.className = 'links-title';
    title.textContent = 'Official resources';
    linksDiv.appendChild(title);
    links.forEach((link) => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label || link.url;
      linksDiv.appendChild(a);
    });
    bubble.appendChild(linksDiv);
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function getReplyFromKnowledge(query) {
  if (!knowledge) return { answer: 'Knowledge base not ready. Try again.', links: [] };
  const section = findBestSection(query);
  if (section) {
    return {
      answer: section.answer,
      links: section.links || [],
    };
  }
  return {
    answer: knowledge.defaultAnswer || 'No matching section found. Try province names, DDF, VOW, RECO, PIPEDA, etc.',
    links: [],
  };
}

async function handleSubmit(e) {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage('user', text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));

  input.value = '';
  sendBtn.disabled = true;

  try {
    await loadKnowledge();
    const { answer, links } = getReplyFromKnowledge(text);
    const answerHtml = linkifyHtml(renderMarkdownLite(answer));
    setTimeout(() => {
      appendMessage('bot', answerHtml, links || []);
      sendBtn.disabled = false;
      input.focus();
    }, 300);
  } catch (err) {
    sendBtn.disabled = false;
    input.focus();
    appendMessage('bot', 'Error: ' + (err && err.message ? err.message : String(err)).replace(/</g, '&lt;').replace(/>/g, '&gt;'), []);
  }
}

form.addEventListener('submit', handleSubmit);
input.focus();

loadStoredSettings();

// Auth: show overlay if not authenticated
const authOverlay = document.getElementById('auth-overlay');
const googleSignInBtn = document.getElementById('google-signin-btn');
const authErrorEl = document.getElementById('auth-error');

async function checkAuth() {
  if (!window.electronAPI || typeof window.electronAPI.checkAuth !== 'function') {
    if (authOverlay) authOverlay.classList.add('hidden');
    return;
  }
  const res = await window.electronAPI.checkAuth();
  if (res && res.ok) {
    if (authOverlay) authOverlay.classList.add('hidden');
  } else {
    if (authOverlay) authOverlay.classList.remove('hidden');
  }
}

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    if (authErrorEl) {
      authErrorEl.classList.add('hidden');
      authErrorEl.textContent = '';
    }
    if (!window.electronAPI || typeof window.electronAPI.startGoogleAuth !== 'function') {
      if (authErrorEl) {
        authErrorEl.textContent = 'Authentication is not available. The app may need to be restarted.';
        authErrorEl.classList.remove('hidden');
      }
      return;
    }
    googleSignInBtn.disabled = true;
    googleSignInBtn.textContent = 'Signing in...';
    try {
      const res = await window.electronAPI.startGoogleAuth();
      if (res && res.ok) {
        await checkAuth();
      } else if (res && res.error && authErrorEl) {
        authErrorEl.textContent = res.error;
        authErrorEl.classList.remove('hidden');
      }
    } catch (err) {
      if (authErrorEl) {
        authErrorEl.textContent = err && err.message ? err.message : 'Sign-in failed. Please try again.';
        authErrorEl.classList.remove('hidden');
      }
    } finally {
      googleSignInBtn.disabled = false;
      googleSignInBtn.textContent = 'Sign in with Google';
    }
  });
}

checkAuth();

async function loadDocSections() {
  if (!window.electronAPI || typeof window.electronAPI.getComplianceSections !== 'function') return [];
  const res = await window.electronAPI.getComplianceSections();
  if (!res || !res.ok || !Array.isArray(res.sections)) return [];
  return res.sections;
}

function showSection(section) {
  if (!section || !docSectionTitle || !docContent) return;
  currentSectionId = section.id;
  docSectionTitle.textContent = section.title || 'Section';
  docContent.innerHTML = section.contentHtml ? sanitizeHtml(section.contentHtml) : '<p>No content.</p>';
  docContent.scrollTop = 0;
  docContent.scrollLeft = 0;
  pagesList.querySelectorAll('.page-list-item').forEach((el) => el.classList.remove('active'));
  const activeBtn = pagesList.querySelector(`[data-section-id="${section.id}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

function renderDocSidebar(sections) {
  if (!pagesList) return;
  pagesList.innerHTML = '';
  sections.forEach((section) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `page-list-item ${currentSectionId === section.id ? 'active' : ''}`;
    btn.setAttribute('data-section-id', section.id);
    btn.textContent = section.title || 'Section';
    btn.addEventListener('click', () => showSection(section));
    pagesList.appendChild(btn);
  });
}

if (pagesBtn && pagesSection && chatContainer) {
  pagesBtn.addEventListener('click', async () => {
    const willShow = pagesSection.classList.contains('hidden');
    pagesSection.classList.toggle('hidden');
    chatContainer.classList.toggle('hidden');
    if (willShow) {
      docSections = await loadDocSections();
      renderDocSidebar(docSections);
      if (docSections.length && !currentSectionId) {
        showSection(docSections[0]);
      } else if (docSections.length && currentSectionId) {
        const current = docSections.find((s) => s.id === currentSectionId);
        if (current) showSection(current);
        else showSection(docSections[0]);
      } else if (docSectionTitle && docContent) {
        docSectionTitle.textContent = 'Compliance documentation';
        docContent.innerHTML = '<p>No sections could be loaded. Add <code>canadian_mls.txt</code> and/or <code>CANADIAN_MLS.pdf</code> to the app folder.</p>';
      }
    }
  });
}

loadKnowledge().catch(() => {});
