/**
 * recovery.js — Context Recovery Screen
 * Loads herds, thumbnails, and renders the timeline + herd grid.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const content = document.getElementById('content');

  // Load recovery data from background
  const data = await chrome.runtime.sendMessage({ action: 'get-recovery-data' });

  if (!data || (!data.timeline.length && !data.herds.length)) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="emoji"><img src="icons/icon.svg" alt="Herd" style="width:32px;height:32px;"></div>
        <h2>No tabs to show</h2>
        <p>Open some tabs and organize them to see your herds here.</p>
      </div>
    `;
    return;
  }

  // Load thumbnails for all tabs
  const allTabIds = [
    ...data.timeline.map(t => t.id),
    ...data.herds.flatMap(h => h.tabs.map(t => t.id)),
  ];
  const uniqueIds = [...new Set(allTabIds)];
  const thumbnails = await loadThumbnails(uniqueIds);

  // Render
  content.innerHTML = `
    <div class="timeline-section">
      <div class="section-label">Your timeline</div>
      <div class="timeline-wrapper">
        <button class="timeline-scroll-hint left hidden" id="scrollLeft">‹</button>
        <div class="timeline" id="timeline">
          ${data.timeline.map(tab => renderTimelineCard(tab, thumbnails)).join('')}
        </div>
        <button class="timeline-scroll-hint right" id="scrollRight">›</button>
      </div>
    </div>
    <div class="herds-section">
      <div class="section-label">Your herds</div>
      <div class="herds-grid">
        ${data.herds.map(herd => renderHerdCard(herd, thumbnails)).join('')}
      </div>
    </div>
  `;

  // Attach event listeners
  attachListeners(data);
  attachScrollArrows();
});

// ─── Thumbnail Loading ─────────────────────────────────────────────────────────

async function loadThumbnails(tabIds) {
  const keys = tabIds.map(id => `thumb_${id}`);
  const result = await chrome.storage.local.get(keys);
  const map = {};
  for (const id of tabIds) {
    map[id] = result[`thumb_${id}`] || null;
  }
  return map;
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

function renderTimelineCard(tab, thumbnails) {
  const thumb = thumbnails[tab.id];
  const thumbHtml = thumb
    ? `<img src="${thumb}" alt="">`
    : `<div class="timeline-thumb-fallback">
         ${tab.favIconUrl ? `<img src="${tab.favIconUrl}" alt="">` : ''}
         <span>${escapeHtml(tab.title || 'Untitled')}</span>
       </div>`;

  return `
    <div class="timeline-card" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">
      <div class="timeline-thumb">${thumbHtml}</div>
      <div class="timeline-meta">
        <div class="timeline-title">${escapeHtml(tab.title || 'Untitled')}</div>
        <div class="timeline-time">${timeAgo(tab.lastAccessed)}</div>
      </div>
    </div>
  `;
}

function renderHerdCard(herd, thumbnails) {
  const tabCount = herd.tabs.length;
  const isUngrouped = herd.id === 'ungrouped';

  return `
    <div class="herd-card" data-herd-id="${herd.id}" data-group-id="${herd.groupId}">
      <div class="herd-header">
        <div class="herd-color-dot color-${herd.color}"></div>
        <input class="herd-name" value="${escapeAttr(herd.name)}" 
          data-herd-id="${herd.id}" data-group-id="${herd.groupId}"
          ${isUngrouped ? 'disabled' : ''}>
        <span class="herd-tab-count">${tabCount} tab${tabCount !== 1 ? 's' : ''}</span>
      </div>
      <input class="herd-note" placeholder="What's this herd for?"
        value="${escapeAttr(herd.note)}" data-herd-id="${herd.id}">
      <div class="herd-tabs-list">
        ${herd.tabs.sort((a, b) => b.lastAccessed - a.lastAccessed).map(tab => renderTabRow(tab)).join('')}
      </div>
    </div>
  `;
}

function renderTabRow(tab) {
  let domain = '';
  try { domain = new URL(tab.url).hostname.replace('www.', ''); } catch {}

  return `
    <div class="tab-row" data-tab-id="${tab.id}" data-window-id="${tab.windowId}">
      <img class="tab-row-favicon" src="${tab.favIconUrl || ''}" onerror="this.style.display='none'" alt="">
      <span class="tab-row-title">${escapeHtml(tab.title || 'Untitled')}</span>
      <span class="tab-row-domain">${escapeHtml(domain)}</span>
      <span class="tab-row-time">${timeAgo(tab.lastAccessed)}</span>
    </div>
  `;
}

// ─── Event Listeners ───────────────────────────────────────────────────────────

function attachListeners(data) {
  // Click tab cards → activate that tab
  document.querySelectorAll('.timeline-card, .tab-row').forEach(card => {
    card.addEventListener('click', () => {
      const tabId = parseInt(card.dataset.tabId, 10);
      const windowId = parseInt(card.dataset.windowId, 10);
      chrome.runtime.sendMessage({ action: 'activate-tab', tabId, windowId });
    });
  });

  // Herd name editing
  document.querySelectorAll('.herd-name').forEach(input => {
    let original = input.value;

    input.addEventListener('focus', () => {
      original = input.value;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        input.value = original;
        input.blur();
      }
    });

    input.addEventListener('blur', () => {
      const newName = input.value.trim();
      if (newName && newName !== original) {
        const groupId = parseInt(input.dataset.groupId, 10);
        if (groupId && groupId !== -1) {
          chrome.runtime.sendMessage({ action: 'rename-herd', groupId, name: newName });
        }
      } else if (!newName) {
        input.value = original;
      }
    });
  });

  // Herd note editing
  document.querySelectorAll('.herd-note').forEach(input => {
    let saveTimeout;

    input.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'save-herd-note',
          herdId: input.dataset.herdId,
          note: input.value,
        });
      }, 500);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
        chrome.runtime.sendMessage({
          action: 'save-herd-note',
          herdId: input.dataset.herdId,
          note: input.value,
        });
      }
    });
  });
}

// ─── Scroll Arrows ─────────────────────────────────────────────────────────────

function attachScrollArrows() {
  const timeline = document.getElementById('timeline');
  const leftBtn = document.getElementById('scrollLeft');
  const rightBtn = document.getElementById('scrollRight');

  if (!timeline || !leftBtn || !rightBtn) return;

  function updateArrows() {
    leftBtn.classList.toggle('hidden', timeline.scrollLeft <= 10);
    rightBtn.classList.toggle('hidden', timeline.scrollLeft >= timeline.scrollWidth - timeline.clientWidth - 10);
  }

  leftBtn.addEventListener('click', () => {
    timeline.scrollBy({ left: -400, behavior: 'smooth' });
  });

  rightBtn.addEventListener('click', () => {
    timeline.scrollBy({ left: 400, behavior: 'smooth' });
  });

  timeline.addEventListener('scroll', updateArrows);
  updateArrows();
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
