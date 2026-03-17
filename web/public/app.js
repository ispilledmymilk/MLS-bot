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
    if (!query.trim()) return;
    dismissQuickTopics();
    const chatInput = document.getElementById('chat-input');
    chatInput.value = query;
    chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
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

function appendChatMessage(role, contentHtml) {
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
  div.appendChild(avatar);
  div.appendChild(bubble);
  chatMessages.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const regionValue = 'canada';
  appendChatMessage('user', text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  chatInput.value = '';
  chatSend.disabled = true;
  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, region: regionValue }),
    });
    const data = await res.json();
    const answer = data.answer != null ? data.answer : (data.error || 'Could not get an answer.');
    const html = answer.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
    appendChatMessage('bot', html);
  } catch (err) {
    appendChatMessage('bot', 'Error: ' + (err.message || String(err)));
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
  }
});
