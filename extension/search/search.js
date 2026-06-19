/**
 * Herd Search — injected content script
 * Renders a Spotlight-style overlay for searching across all open tabs.
 * Uses Shadow DOM for complete style isolation from the host page.
 */

(function () {
  // Prevent double-injection
  if (document.getElementById('herd-search-root')) {
    const existing = document.getElementById('herd-search-root');
    existing.shadowRoot.querySelector('.herd-search-overlay').classList.add('visible');
    existing.shadowRoot.querySelector('.herd-search-input').focus();
    existing.shadowRoot.querySelector('.herd-search-input').select();
    return;
  }

  // ─── Create Shadow DOM Host ──────────────────────────────────────────────────

  const host = document.createElement('div');
  host.id = 'herd-search-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ─── Styles ──────────────────────────────────────────────────────────────────

  const styles = document.createElement('style');
  styles.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    .herd-search-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 22vh;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .herd-search-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .herd-search-container {
      width: 580px;
      max-width: calc(100vw - 48px);
      background: #fff;
      border-radius: 16px;
      box-shadow:
        0 24px 80px rgba(0, 0, 0, 0.25),
        0 0 0 1px rgba(0, 0, 0, 0.06);
      transform: scale(0.97) translateY(-8px);
      transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1);
      overflow: hidden;
    }

    .herd-search-overlay.visible .herd-search-container {
      transform: scale(1) translateY(0);
    }

    /* Input area */
    .herd-search-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid #f0f0f0;
    }

    .herd-search-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      opacity: 0.4;
    }

    .herd-search-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 17px;
      font-weight: 400;
      color: #1a1a1a;
      background: transparent;
      font-family: inherit;
      letter-spacing: -0.2px;
    }

    .herd-search-input::placeholder {
      color: #a0a0a0;
    }

    .herd-search-shortcut {
      flex-shrink: 0;
      font-size: 11px;
      color: #999;
      background: #f5f5f5;
      border: 1px solid #e8e8e8;
      border-radius: 5px;
      padding: 2px 6px;
      font-family: inherit;
    }

    /* Results */
    .herd-search-results {
      max-height: 360px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .herd-search-results::-webkit-scrollbar {
      width: 6px;
    }

    .herd-search-results::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.12);
      border-radius: 3px;
    }

    .herd-search-empty {
      padding: 32px 20px;
      text-align: center;
      color: #999;
      font-size: 13px;
    }

    .herd-search-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      cursor: pointer;
      transition: background 0.06s;
    }

    .herd-search-item:hover,
    .herd-search-item.selected {
      background: #f0faf4;
    }

    .herd-search-item.selected {
      background: #e6f7ed;
    }

    .herd-search-favicon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      object-fit: contain;
      background: #f5f5f5;
    }

    .herd-search-favicon-fallback {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: #e8e8e8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: #666;
      font-weight: 600;
    }

    .herd-search-item-content {
      flex: 1;
      min-width: 0;
    }

    .herd-search-item-title {
      font-size: 13.5px;
      font-weight: 500;
      color: #1a1a1a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }

    .herd-search-item-url {
      font-size: 11.5px;
      color: #888;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
      margin-top: 1px;
    }

    .herd-search-item-herd {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 500;
      color: #22a65c;
      background: #e6f7ed;
      border-radius: 4px;
      padding: 2px 8px;
      white-space: nowrap;
    }

    .herd-search-highlight {
      background: #d4f5e2;
      border-radius: 2px;
      padding: 0 1px;
    }

    /* Footer */
    .herd-search-footer {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 20px;
      border-top: 1px solid #f0f0f0;
      font-size: 11px;
      color: #999;
    }

    .herd-search-footer kbd {
      display: inline-block;
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 3px;
      padding: 1px 5px;
      font-family: inherit;
      font-size: 10px;
      margin: 0 2px;
    }

    /* No results */
    .herd-search-no-results {
      padding: 40px 20px;
      text-align: center;
      color: #888;
      font-size: 13px;
    }

    .herd-search-no-results strong {
      display: block;
      margin-bottom: 4px;
      color: #555;
    }
  `;

  // ─── HTML Structure ──────────────────────────────────────────────────────────

  const container = document.createElement('div');
  container.innerHTML = `
    <div class="herd-search-overlay">
      <div class="herd-search-container">
        <div class="herd-search-header">
          <svg class="herd-search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="8.5" cy="8.5" r="5.5"/>
            <line x1="13" y1="13" x2="17" y2="17"/>
          </svg>
          <input type="text" class="herd-search-input" placeholder="Search tabs..." autocomplete="off" spellcheck="false">
          <span class="herd-search-shortcut">Esc</span>
        </div>
        <div class="herd-search-results"></div>
        <div class="herd-search-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  `;

  shadow.appendChild(styles);
  shadow.appendChild(container);

  // ─── References ──────────────────────────────────────────────────────────────

  const overlay = shadow.querySelector('.herd-search-overlay');
  const input = shadow.querySelector('.herd-search-input');
  const resultsContainer = shadow.querySelector('.herd-search-results');

  let results = [];
  let selectedIndex = 0;

  // ─── Show / Hide ─────────────────────────────────────────────────────────────

  function show() {
    overlay.classList.add('visible');
    input.focus();
    input.value = '';
    resultsContainer.innerHTML = '';
    selectedIndex = 0;
    loadAllTabs();
  }

  function hide() {
    overlay.classList.remove('visible');
    input.blur();
  }

  // ─── Fuzzy Matching ──────────────────────────────────────────────────────────

  function fuzzyScore(query, text) {
    if (!text) return 0;
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    // Exact substring match — highest score
    if (t.includes(q)) {
      const idx = t.indexOf(q);
      // Bonus for prefix match
      return 100 + (idx === 0 ? 50 : 0) + (q.length / t.length) * 30;
    }

    // Word-boundary subsequence
    let qi = 0;
    let score = 0;
    let consecutive = 0;
    let lastMatchIdx = -2;

    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        qi++;
        // Bonus for word boundaries
        if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '/' || t[ti - 1] === '-' || t[ti - 1] === '.') {
          score += 10;
        }
        // Bonus for consecutive matches
        if (ti === lastMatchIdx + 1) {
          consecutive++;
          score += consecutive * 3;
        } else {
          consecutive = 0;
        }
        score += 3;
        lastMatchIdx = ti;
      }
    }

    // All query chars must match
    if (qi < q.length) return 0;

    return score;
  }

  function scoreTab(query, tab) {
    const titleScore = fuzzyScore(query, tab.title) * 1.5; // Title weighted higher
    const urlScore = fuzzyScore(query, tab.url);
    const herdScore = fuzzyScore(query, tab.herdName) * 1.2;
    return Math.max(titleScore, urlScore, herdScore);
  }

  // ─── Highlighting ────────────────────────────────────────────────────────────

  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx === -1) return escapeHtml(text);

    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));
    return `${before}<span class="herd-search-highlight">${match}</span>${after}`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Render Results ──────────────────────────────────────────────────────────

  function render() {
    if (results.length === 0 && input.value.length > 0) {
      resultsContainer.innerHTML = `
        <div class="herd-search-no-results">
          <strong>No tabs found</strong>
          Nothing matches "${escapeHtml(input.value)}"
        </div>
      `;
      return;
    }

    if (results.length === 0) {
      resultsContainer.innerHTML = `<div class="herd-search-empty">Start typing to search across all your tabs</div>`;
      return;
    }

    const query = input.value;
    resultsContainer.innerHTML = results.map((tab, i) => {
      const faviconHtml = tab.favIconUrl
        ? `<img class="herd-search-favicon" src="${escapeHtml(tab.favIconUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '';
      const fallbackLetter = tab.title ? tab.title[0].toUpperCase() : '?';
      const herdBadge = tab.herdName
        ? `<span class="herd-search-item-herd">${escapeHtml(tab.herdName)}</span>`
        : '';

      // Clean URL for display
      let displayUrl = tab.url || '';
      try {
        const u = new URL(displayUrl);
        displayUrl = u.hostname + (u.pathname !== '/' ? u.pathname : '');
      } catch {}

      return `
        <div class="herd-search-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
          ${faviconHtml}
          <div class="herd-search-favicon-fallback" style="${tab.favIconUrl ? 'display:none' : ''}">${fallbackLetter}</div>
          <div class="herd-search-item-content">
            <div class="herd-search-item-title">${highlightMatch(tab.title || 'Untitled', query)}</div>
            <div class="herd-search-item-url">${highlightMatch(displayUrl, query)}</div>
          </div>
          ${herdBadge}
        </div>
      `;
    }).join('');
  }

  // ─── Data Loading ────────────────────────────────────────────────────────────

  let allTabs = [];

  function loadAllTabs() {
    chrome.runtime.sendMessage({ action: 'search-get-tabs' }, (response) => {
      if (response && response.tabs) {
        allTabs = response.tabs;
        doSearch();
      }
    });
  }

  function doSearch() {
    const query = input.value.trim();
    if (!query) {
      // Show recent tabs (by last accessed) when no query
      results = allTabs.slice(0, 8);
      selectedIndex = 0;
      render();
      return;
    }

    // Score and rank
    const scored = allTabs
      .map(tab => ({ ...tab, score: scoreTab(query, tab) }))
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    results = scored;
    selectedIndex = 0;
    render();
  }

  // ─── Event Handlers ──────────────────────────────────────────────────────────

  input.addEventListener('input', () => {
    doSearch();
  });

  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        render();
        scrollToSelected();
        break;

      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        render();
        scrollToSelected();
        break;

      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          activateTab(results[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        hide();
        break;
    }
  });

  // Click on result
  resultsContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.herd-search-item');
    if (item) {
      const idx = parseInt(item.dataset.index, 10);
      if (results[idx]) {
        activateTab(results[idx]);
      }
    }
  });

  // Click on backdrop to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hide();
    }
  });

  function scrollToSelected() {
    const selected = shadow.querySelector('.herd-search-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function activateTab(tab) {
    chrome.runtime.sendMessage({ action: 'search-activate-tab', tabId: tab.id, windowId: tab.windowId });
    hide();
  }

  // ─── Listen for toggle message from background ──────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle-search') {
      if (overlay.classList.contains('visible')) {
        hide();
      } else {
        show();
      }
    }
  });

  // ─── Initialize ──────────────────────────────────────────────────────────────

  show();
})();
