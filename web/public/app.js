/**
 * ComplianceHQ — Chat + Document Library (no upload)
 */

const API = '/api';

let allDocuments = [];
let filterCategory = 'all';
let filterJurisdiction = 'all';

document.querySelectorAll('.nav-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.nav-tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.web-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(`panel-${tab}`);
    if (panel) panel.classList.add('active');
    if (tab === 'docs') {
      if (allDocuments.length === 0) loadDocumentLibrary();
      else applyDocumentLibraryFilters();
    }
  });
});

// Preload document library on page load so documents are ready when user opens the tab
loadDocumentLibrary();

function dismissQuickTopics() {
  const el = document.getElementById('quick-topics-inline');
  if (!el) return;
  el.classList.add('fading-out');
  setTimeout(() => el.remove(), 200);
}

document.querySelectorAll('.quick-topic-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query') || '';
    const label = btn.textContent.trim();
    if (!query.trim()) return;
    dismissQuickTopics();
    submitChat(label, query);
  });
});

document.getElementById('chat-input').addEventListener('input', dismissQuickTopics, { once: true });

function inferCategory(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('disclosure')) return 'disclosure';
  if (t.includes('escrow')) return 'escrow';
  if (t.includes('contract') || t.includes('agreement')) return 'contract';
  if (t.includes('fair housing')) return 'fair-housing';
  if (t.includes('title')) return 'title';
  if (t.includes('security')) return 'security';
  return 'disclosure';
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return (div.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function formatJurisdiction(region) {
  if (region === 'canada') return 'Canada';
  if (region === 'usa') return 'USA';
  if (region === 'portugal') return 'Portugal';
  if (region === 'mexico') return 'Mexico';
  return region;
}


let filtersSetup = false;

async function loadDocumentLibrary() {
  const regions = ['canada', 'usa', 'portugal', 'mexico'];
  allDocuments = [];
  let index = 0;
  for (const region of regions) {
    try {
      const res = await fetch(`${API}/sections?region=${encodeURIComponent(region)}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.sections)) {
        data.sections.forEach((sec) => {
          allDocuments.push({
            id: `${region}-${sec.id}`,
            title: sec.title || 'Document',
            description: stripHtml(sec.contentHtml),
            jurisdiction: region,
            jurisdictionLabel: formatJurisdiction(region),
            category: sec.category || inferCategory(sec.title),
            contentHtml: sec.contentHtml,
          });
          index++;
        });
      }
    } catch (e) {
      console.warn('Document Library: failed to load region', region, e);
    }
  }
  if (!filtersSetup) {
    setupDocumentLibraryFilters();
    filtersSetup = true;
  }
  applyDocumentLibraryFilters();
}

function getCategoriesForJurisdiction(region) {
  const set = new Set();
  allDocuments.forEach((doc) => {
    if (doc.jurisdiction === region && doc.category) set.add(doc.category);
  });
  return Array.from(set).sort();
}

function renderCategoryPanel() {
  const container = document.getElementById('doc-category-options');
  const hint = document.getElementById('doc-category-hint');
  if (!container) return;
  if (filterJurisdiction === 'all') {
    hint.textContent = 'Select a jurisdiction to see categories.';
    hint.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }
  hint.classList.add('hidden');
  const categories = getCategoriesForJurisdiction(filterJurisdiction);
  container.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'filter-option' + (filterCategory === 'all' ? ' active' : '');
  allBtn.setAttribute('data-filter', 'category');
  allBtn.setAttribute('data-value', 'all');
  allBtn.textContent = 'All';
  container.appendChild(allBtn);
  categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-option' + (filterCategory === cat ? ' active' : '');
    btn.setAttribute('data-filter', 'category');
    btn.setAttribute('data-value', cat);
    btn.textContent = cat;
    container.appendChild(btn);
  });
}

function setupDocumentLibraryFilters() {
  const categoryPanel = document.getElementById('doc-filters-category');
  const jurisdictionBtns = document.querySelectorAll('.filter-option[data-filter="jurisdiction"]');

  jurisdictionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute('data-value');
      filterJurisdiction = value;
      jurisdictionBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if (value === 'all') {
        categoryPanel.classList.remove('visible');
        categoryPanel.setAttribute('aria-hidden', 'true');
        filterCategory = 'all';
      } else {
        categoryPanel.classList.add('visible');
        categoryPanel.setAttribute('aria-hidden', 'false');
        filterCategory = 'all';
        renderCategoryPanel();
      }
      applyDocumentLibraryFilters();
    });
  });

  document.getElementById('doc-category-options').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-option[data-filter="category"]');
    if (!btn) return;
    filterCategory = btn.getAttribute('data-value');
    document.querySelectorAll('#doc-category-options .filter-option').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyDocumentLibraryFilters();
  });

  const searchEl = document.getElementById('doc-search');
  if (searchEl) searchEl.addEventListener('input', () => applyDocumentLibraryFilters());
}

function applyDocumentLibraryFilters() {
  const searchQuery = (document.getElementById('doc-search').value || '').trim().toLowerCase();
  let list = allDocuments.filter((doc) => {
    if (filterCategory !== 'all' && doc.category !== filterCategory) return false;
    if (filterJurisdiction !== 'all' && doc.jurisdiction !== filterJurisdiction) return false;
    if (searchQuery && !(doc.title || '').toLowerCase().includes(searchQuery) && !(doc.description || '').toLowerCase().includes(searchQuery)) return false;
    return true;
  });
  const gridEl = document.getElementById('doc-grid');
  const countEl = document.getElementById('doc-count');
  if (!gridEl) return;
  countEl.textContent = `${list.length} document${list.length !== 1 ? 's' : ''}`;
  gridEl.innerHTML = '';
  const docIconSvg = '<svg class="doc-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
  list.forEach((doc) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'doc-card';
    card.innerHTML = `
      ${docIconSvg}
      <h3 class="doc-card-title">${escapeHtml(doc.title)}</h3>
      <p class="doc-card-desc">${escapeHtml(doc.description || '')}</p>
      <div class="doc-card-meta">
        <span>${escapeHtml(doc.jurisdictionLabel)}</span>
      </div>
    `;
    card.addEventListener('click', () => openDocDetail(doc));
    gridEl.appendChild(card);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function openDocDetail(doc) {
  document.getElementById('doc-detail-title').textContent = doc.title;
  document.getElementById('doc-detail-meta').textContent = doc.jurisdictionLabel;
  document.getElementById('doc-detail-content').innerHTML = doc.contentHtml || '<p>No content.</p>';
  document.getElementById('doc-detail-overlay').classList.remove('hidden');
}

document.getElementById('doc-detail-close').addEventListener('click', () => {
  document.getElementById('doc-detail-overlay').classList.add('hidden');
});

document.getElementById('doc-detail-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'doc-detail-overlay') document.getElementById('doc-detail-overlay').classList.add('hidden');
});

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatForm = document.getElementById('chat-form');
const welcomeBubble = document.getElementById('welcome-bubble');
const quickTopicsInline = document.getElementById('quick-topics-inline');

const CHAT_STORAGE_KEY = 'compliancehq_chat_history';
const MAX_CHATS = 50;

let chatHistory = [];
let currentChatId = null;

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) chatHistory = JSON.parse(raw);
    else chatHistory = [];
  } catch {
    chatHistory = [];
  }
}

function saveChatHistory() {
  try {
    const toSave = chatHistory.slice(-MAX_CHATS);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
    if (toSave.length < chatHistory.length) chatHistory = toSave;
  } catch {}
}

function getCurrentChat() {
  return currentChatId ? chatHistory.find((c) => c.id === currentChatId) : null;
}

function renderChatList() {
  const list = document.getElementById('chat-history-list');
  if (!list) return;
  list.innerHTML = '';
  const sorted = [...chatHistory].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  sorted.forEach((chat) => {
    const li = document.createElement('li');
    li.className = 'chat-history-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-history-item' + (chat.id === currentChatId ? ' active' : '');
    btn.setAttribute('data-chat-id', chat.id);
    btn.textContent = chat.title || 'New chat';
    btn.title = chat.title || 'New chat';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'chat-delete-btn';
    delBtn.setAttribute('aria-label', 'Delete chat');
    delBtn.setAttribute('data-chat-id', chat.id);
    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;
    li.appendChild(btn);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

function confirmDeleteChat(id) {
  const chat = chatHistory.find((c) => c.id === id);
  if (!chat) return;
  const modal = document.getElementById('delete-chat-modal');
  const titleEl = document.getElementById('delete-chat-modal-title');
  if (titleEl) titleEl.textContent = `"${chat.title || 'New chat'}"`;
  modal.classList.remove('hidden');
  document.getElementById('delete-chat-confirm').onclick = () => {
    deleteChat(id);
    modal.classList.add('hidden');
  };
  document.getElementById('delete-chat-cancel').onclick = () => modal.classList.add('hidden');
}

function deleteChat(id) {
  chatHistory = chatHistory.filter((c) => c.id !== id);
  saveChatHistory();
  if (currentChatId === id) {
    currentChatId = null;
    showEmptyChatState();
  }
  renderChatList();
}

function showEmptyChatState() {
  if (welcomeBubble) welcomeBubble.style.display = '';
  if (quickTopicsInline) quickTopicsInline.style.display = '';
  document.querySelectorAll('#chat-messages .message').forEach((el) => el.remove());
  hideRelatedChatBanner();
}

const SIMILARITY_STOP = new Set([
  'what','the','are','is','how','does','do','did','a','an','in','on','at','of',
  'for','and','or','to','by','with','from','about','apply','applies','should',
  'can','be','been','have','has','had','that','this','these','those','which',
  'there','their','they','when','where','why','who','will','would','could',
  'may','might','must','shall','need','get','use','used','make','made','any',
  'all','its','it','my','your','our','us','we','me','i','tell','me','explain',
]);

function getKeywords(text) {
  return (text || '').toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SIMILARITY_STOP.has(w));
}

function findRelatedChat(query) {
  if (chatHistory.length === 0) return null;
  const queryWords = new Set(getKeywords(query));
  if (queryWords.size === 0) return null;
  let bestChat = null;
  let bestScore = 0;
  for (const chat of chatHistory) {
    if (chat.id === currentChatId) continue;
    const chatText = [
      chat.title || '',
      ...(chat.messages || []).filter((m) => m.role === 'user').map((m) => m.content || ''),
    ].join(' ');
    const chatWords = getKeywords(chatText);
    let overlap = 0;
    for (const w of chatWords) {
      if (queryWords.has(w)) overlap++;
    }
    const score = overlap / Math.max(queryWords.size, 1);
    if (score > bestScore && score >= 0.35) {
      bestScore = score;
      bestChat = chat;
    }
  }
  return bestChat;
}

const relatedChatBanner = document.getElementById('related-chat-banner');

function hideRelatedChatBanner() {
  if (relatedChatBanner) relatedChatBanner.classList.add('hidden');
}

function showRelatedChatBanner(chat) {
  if (!relatedChatBanner) return;
  relatedChatBanner.innerHTML = `
    <span class="related-chat-icon">💬</span>
    <span class="related-chat-text">Related chat: <strong>${escapeHtml(chat.title || 'Previous conversation')}</strong></span>
    <button type="button" class="related-chat-view-btn" data-chat-id="${escapeHtml(chat.id)}">Continue there</button>
    <button type="button" class="related-chat-dismiss-btn" aria-label="Dismiss">✕</button>
  `;
  relatedChatBanner.classList.remove('hidden');
  relatedChatBanner.querySelector('.related-chat-view-btn').addEventListener('click', () => {
    switchToChat(chat.id);
    hideRelatedChatBanner();
  });
  relatedChatBanner.querySelector('.related-chat-dismiss-btn').addEventListener('click', hideRelatedChatBanner);
}

function renderChatMessages(messages) {
  if (welcomeBubble) welcomeBubble.style.display = 'none';
  if (quickTopicsInline) quickTopicsInline.style.display = 'none';
  document.querySelectorAll('#chat-messages .message').forEach((el) => el.remove());
  (messages || []).forEach((msg) => {
    const html = msg.role === 'user' ? (msg.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') : renderMarkdown(msg.content || '');
    appendChatMessage(msg.role, html);
  });
}

function switchToChat(id) {
  currentChatId = id || null;
  hideRelatedChatBanner();
  const chat = getCurrentChat();
  if (!chat || !chat.messages || chat.messages.length === 0) showEmptyChatState();
  else renderChatMessages(chat.messages);
  renderChatList();
}

function newChat() {
  currentChatId = null;
  showEmptyChatState();
  renderChatList();
}

document.getElementById('chat-new-btn').addEventListener('click', newChat);

document.getElementById('chat-history-list').addEventListener('click', (e) => {
  const delBtn = e.target.closest('.chat-delete-btn');
  if (delBtn) {
    e.stopPropagation();
    confirmDeleteChat(delBtn.getAttribute('data-chat-id'));
    return;
  }
  const btn = e.target.closest('.chat-history-item');
  if (!btn) return;
  const id = btn.getAttribute('data-chat-id');
  if (id) switchToChat(id);
});

loadChatHistory();
renderChatList();

document.getElementById('delete-chat-modal').addEventListener('click', (e) => {
  if (e.target.id === 'delete-chat-modal') e.target.classList.add('hidden');
});

function appendChatMessage(role, contentHtml) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.setAttribute('data-role', role);
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'U' : 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const p = document.createElement('p');
  p.innerHTML = contentHtml;
  bubble.appendChild(p);
  div.appendChild(avatar);
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function createStreamingBubble() {
  const div = document.createElement('div');
  div.className = 'message bot';
  div.setAttribute('data-role', 'bot');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = 'AI';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const p = document.createElement('p');
  p.innerHTML = '<span class="typing-cursor">▋</span>';
  bubble.appendChild(p);
  div.appendChild(avatar);
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return p;
}

function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

async function submitChat(displayLabel, apiQuery) {
  if (!displayLabel.trim() || !apiQuery.trim()) return;

  let chat = getCurrentChat();
  if (!chat) {
    const related = findRelatedChat(displayLabel);
    if (related) showRelatedChatBanner(related);
    chat = {
      id: Date.now().toString(),
      title: '',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    chatHistory.push(chat);
    currentChatId = chat.id;
    renderChatList();
  }
  chat.messages.push({ role: 'user', content: displayLabel });
  chat.updatedAt = Date.now();
  if (!chat.title) chat.title = displayLabel.slice(0, 40).trim() || 'New chat';

  if (welcomeBubble) welcomeBubble.style.display = 'none';
  if (quickTopicsInline) quickTopicsInline.style.display = 'none';
  appendChatMessage('user', displayLabel.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  chatInput.value = '';
  chatSend.disabled = true;

  const p = createStreamingBubble();
  let fullText = '';

  try {
    const response = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: apiQuery, region: 'all' }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') break;
        try {
          const chunk = JSON.parse(raw);
          if (chunk && typeof chunk === 'object' && chunk.error) {
            fullText = chunk.error;
            p.innerHTML = renderMarkdown(fullText);
          } else if (typeof chunk === 'string') {
            fullText += chunk;
            p.innerHTML = renderMarkdown(fullText) + '<span class="typing-cursor">▋</span>';
            p.closest('.message').scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        } catch {}
      }
    }
    p.innerHTML = renderMarkdown(fullText) || 'Sorry, I could not get a response. Please try again.';
  } catch (err) {
    fullText = err.message || String(err);
    p.innerHTML = 'Error: ' + fullText;
  } finally {
    chat = getCurrentChat();
    if (chat) {
      chat.messages.push({ role: 'bot', content: fullText });
      chat.updatedAt = Date.now();
      saveChatHistory();
      renderChatList();
    }
    chatSend.disabled = false;
    chatInput.focus();
  }
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  await submitChat(text, text);
});
