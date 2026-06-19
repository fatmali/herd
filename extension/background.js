/**
 * herd - background service worker
 * 
 * Core logic: classify tabs → group them. Runs on install, on alarm, and on demand.
 */

// ─── Default Rules ───────────────────────────────────────────────────────────

const DEFAULT_RULES = {
  'Code Review': {
    patterns: ['*github.com/*/pull/*', '*dev.azure.com/*/pullrequest/*', '*.visualstudio.com/*pullrequest*', '*gitlab.com/*/merge_requests/*'],
    color: 'green'
  },
  'Work Items': {
    patterns: ['*dev.azure.com/*/workitems*', '*dev.azure.com/*/_boards*', '*.visualstudio.com/*workitem*', '*jira.*.com*', '*linear.app*'],
    color: 'blue'
  },
  'Incidents': {
    patterns: ['*microsofticm.com*', '*pagerduty.com*', '*opsgenie.com*', '*servicenow.com*'],
    color: 'red'
  },
  'Design': {
    patterns: ['*figma.com*', '*canva.com*', '*miro.com*'],
    color: 'pink'
  },
  'Documentation': {
    patterns: ['*wiki*', 'docs.*', '*notion.so*', 'learn.microsoft.com*', '*confluence*', '*loop.cloud.microsoft*'],
    color: 'purple'
  },
  'AI & Copilot': {
    patterns: ['*m365.cloud.microsoft*chat*', '*m365.cloud.microsoft*agent*', '*copilot*', '*chatgpt.com*', '*claude.ai*'],
    color: 'orange'
  },
  'Email': {
    patterns: ['outlook.office.com*', 'outlook.live.com*', 'mail.google.com*'],
    color: 'yellow'
  },
  'Meetings & Chat': {
    patterns: ['*teams.microsoft.com*', '*zoom.us*', '*meet.google.com*', '*slack.com*'],
    color: 'red'
  },
  'Dev Tools': {
    patterns: ['localhost:*', '127.0.0.1:*', '*github.dev*', '*codespaces*', '*vscode.dev*'],
    color: 'cyan'
  },
};

const SCHEDULE_MINUTES = 60; // Default: every hour

// ─── Initialization ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // Set default config if first install
  const existing = await chrome.storage.local.get(['rules', 'enabled', 'schedule']);
  if (!existing.rules) {
    await chrome.storage.local.set({
      rules: DEFAULT_RULES,
      enabled: true,
      schedule: SCHEDULE_MINUTES,
      collapseInactive: true,
      ungroupedName: null, // null = don't group uncategorized tabs
      focusTopics: [],
      lastRun: null,
    });
  }

  // Show welcome page on first install (not on updates)
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }

  // Set up the recurring alarm
  setupAlarm(existing.schedule || SCHEDULE_MINUTES);

  // Create context menu
  chrome.contextMenus.removeAll();
  const rules = existing.rules || DEFAULT_RULES;
  chrome.contextMenus.create({
    id: 'herd-parent',
    title: 'Herd: Add tab to category',
    contexts: ['page'],
  });
  for (const name of Object.keys(rules)) {
    chrome.contextMenus.create({
      id: `herd-assign-${name}`,
      parentId: 'herd-parent',
      title: name,
      contexts: ['page'],
    });
  }
  chrome.contextMenus.create({
    id: 'herd-assign-new',
    parentId: 'herd-parent',
    title: '+ New category...',
    contexts: ['page'],
  });

  // Run immediately on install
  await organizeTabs();
});

// ─── Context Menu (right-click tab → assign to category) ─────────────────────

/**
 * Generate a useful URL pattern from a full URL.
 * Picks the most identifying path segment(s) rather than just the domain.
 */
// Examples:
//   dev.azure.com/office/OC/_backlogs/... => *dev.azure.com/*/_backlogs*
//   github.com/org/repo/pull/42           => *github.com/*/pull/*
//   figma.com/design/abc/MyFile           => *figma.com/design/*
function generatePattern(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace('www.', '');
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (pathParts.length === 0) {
      return `*${host}*`;
    }

    // Find the most identifying path segment (prefer ones starting with _ or known keywords)
    const identifiers = ['pull', 'pullrequest', 'issues', 'merge_requests', '_backlogs',
      '_boards', '_workitems', 'incidents', 'mail', 'chat', 'meeting', 'design',
      'file', 'document', 'wiki', 'search', 'settings'];

    // Check if any path segment is a known identifier
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i].toLowerCase();
      if (identifiers.includes(part) || part.startsWith('_')) {
        // Use host + wildcard + this segment
        return `*${host}/*/${pathParts[i]}*`;
      }
    }

    // For short paths (1-2 segments), use the first segment
    if (pathParts.length <= 2) {
      return `*${host}/${pathParts[0]}*`;
    }

    // For longer paths, use host + first 2 meaningful segments
    return `*${host}/${pathParts[0]}/${pathParts[1]}*`;
  } catch {
    return `*${url}*`;
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.menuItemId.startsWith('herd-assign-')) return;

  const categoryName = info.menuItemId.replace('herd-assign-', '');

  if (categoryName === 'new') {
    // Open options page for creating a new rule from this tab's URL
    const pattern = generatePattern(tab.url);
    chrome.runtime.openOptionsPage();
    await chrome.storage.local.set({ pendingRuleDomain: pattern });
    return;
  }

  // Add a smart pattern for this tab's URL to the selected category
  const { rules } = await chrome.storage.local.get('rules');
  if (!rules || !rules[categoryName]) return;

  const pattern = generatePattern(tab.url);

  if (!rules[categoryName].patterns.includes(pattern)) {
    rules[categoryName].patterns.push(pattern);
    await chrome.storage.local.set({ rules });
    rebuildContextMenu(rules);
  }

  // Re-organize to apply immediately
  await organizeTabs();
});

async function rebuildContextMenu(rules) {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'herd-parent',
    title: 'Herd: Add tab to category',
    contexts: ['page'],
  });
  for (const name of Object.keys(rules)) {
    chrome.contextMenus.create({
      id: `herd-assign-${name}`,
      parentId: 'herd-parent',
      title: name,
      contexts: ['page'],
    });
  }
  chrome.contextMenus.create({
    id: 'herd-assign-new',
    parentId: 'herd-parent',
    title: '+ New category...',
    contexts: ['page'],
  });
}

// ─── Alarm (scheduled runs) ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'herd-organize') {
    const { enabled } = await chrome.storage.local.get('enabled');
    if (enabled) await organizeTabs();
  }
});

function setupAlarm(minutes) {
  chrome.alarms.clear('herd-organize');
  chrome.alarms.create('herd-organize', { periodInMinutes: minutes });
}

// ─── Message handling (from popup, options, or external) ─────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'organize-now') {
    organizeTabs().then(result => sendResponse(result));
    return true;
  }
  if (msg.action === 'set-focus') {
    chrome.storage.local.set({ focusTopics: msg.topics });
    organizeTabs().then(result => sendResponse(result));
    return true;
  }
  if (msg.action === 'get-status') {
    getStatus().then(status => sendResponse(status));
    return true;
  }
  if (msg.action === 'search-get-tabs') {
    getSearchableTabs().then(tabs => sendResponse({ tabs }));
    return true;
  }
  if (msg.action === 'search-activate-tab') {
    chrome.tabs.update(msg.tabId, { active: true });
    chrome.windows.update(msg.windowId, { focused: true });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'get-recovery-data') {
    getRecoveryData().then(data => sendResponse(data));
    return true;
  }
  if (msg.action === 'get-thumbnail') {
    chrome.storage.local.get(`thumb_${msg.tabId}`).then(result => {
      sendResponse({ dataUrl: result[`thumb_${msg.tabId}`] || null });
    });
    return true;
  }
  if (msg.action === 'save-herd-note') {
    chrome.storage.local.get('herdNotes').then(({ herdNotes }) => {
      const notes = herdNotes || {};
      notes[msg.herdId] = msg.note;
      chrome.storage.local.set({ herdNotes: notes });
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.action === 'rename-herd') {
    chrome.tabGroups.update(msg.groupId, { title: msg.name }).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });
    return true;
  }
  if (msg.action === 'activate-tab') {
    chrome.tabs.update(msg.tabId, { active: true });
    chrome.windows.update(msg.windowId, { focused: true });
    sendResponse({ ok: true });
    return true;
  }
});

// External messaging removed for security — use the MCP service bridge instead

// ─── Search: Keyboard Shortcut + Tab Data ────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-search') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://')) {
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['search/search.js'],
      });
    } catch (err) {
      console.log('herd: Could not inject search into this tab:', err.message);
    }
  }

  if (command === 'open-recovery') {
    // Open or focus existing recovery tab
    const existing = await chrome.tabs.query({ url: chrome.runtime.getURL('recovery.html') });
    if (existing.length > 0) {
      chrome.tabs.update(existing[0].id, { active: true });
      chrome.windows.update(existing[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: 'recovery.html' });
    }
  }
});

async function getSearchableTabs() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const groups = await chrome.tabGroups.query({});
  const groupMap = {};
  for (const g of groups) {
    groupMap[g.id] = g.title || '';
  }

  const tabs = [];
  for (const win of windows) {
    for (const tab of win.tabs) {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) continue;
      tabs.push({
        id: tab.id,
        title: tab.title || '',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl || '',
        windowId: win.id,
        herdName: tab.groupId !== -1 ? (groupMap[tab.groupId] || '') : '',
        lastAccessed: tab.lastAccessed || 0,
      });
    }
  }

  // Sort by most recently accessed
  tabs.sort((a, b) => b.lastAccessed - a.lastAccessed);
  return tabs;
}

// ─── Thumbnail Capture ────────────────────────────────────────────────────────

// Capture the visible tab when the user switches away from it
let lastActiveTabId = null;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // Capture the tab we're LEAVING (the previous active tab)
  if (lastActiveTabId && lastActiveTabId !== activeInfo.tabId) {
    await captureThumbnail(lastActiveTabId, activeInfo.windowId);
  }
  lastActiveTabId = activeInfo.tabId;
});

async function captureThumbnail(tabId, windowId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: 'jpeg',
      quality: 50,
    });
    // Store by tabId and also by URL for persistence
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return;

    const key = `thumb_${tabId}`;
    const store = { [key]: dataUrl };

    // Also store by URL (fallback for after restart)
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
      store[`thumburl_${hashUrl(tab.url)}`] = dataUrl;
    }

    await chrome.storage.local.set(store);
  } catch {
    // Can't capture (browser page, devtools, etc.) — skip silently
  }
}

function hashUrl(url) {
  // Simple hash for URL-based thumbnail lookup
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// Clean up thumbnails when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`thumb_${tabId}`);
});

// ─── Recovery Screen Data ─────────────────────────────────────────────────────

async function getRecoveryData() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const groups = await chrome.tabGroups.query({});
  const groupMap = {};
  for (const g of groups) {
    groupMap[g.id] = { title: g.title || '', color: g.color || 'grey', id: g.id };
  }

  // Get herd notes
  const { herdNotes } = await chrome.storage.local.get('herdNotes');
  const notes = herdNotes || {};

  // Build herds
  const herds = {};
  const allTabs = [];

  for (const win of windows) {
    for (const tab of win.tabs) {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) continue;
      if (tab.url === chrome.runtime.getURL('recovery.html')) continue;

      const tabData = {
        id: tab.id,
        title: tab.title || '',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl || '',
        windowId: win.id,
        groupId: tab.groupId,
        lastAccessed: tab.lastAccessed || 0,
        index: tab.index,
      };

      allTabs.push(tabData);

      const herdKey = tab.groupId !== -1 ? `group_${tab.groupId}` : 'ungrouped';
      if (!herds[herdKey]) {
        const group = groupMap[tab.groupId];
        herds[herdKey] = {
          id: herdKey,
          groupId: tab.groupId,
          name: group ? group.title : 'Ungrouped',
          color: group ? group.color : 'grey',
          tabs: [],
          note: notes[herdKey] || '',
        };
      }
      herds[herdKey].tabs.push(tabData);
    }
  }

  // Sort timeline by most recent
  allTabs.sort((a, b) => b.lastAccessed - a.lastAccessed);

  return {
    timeline: allTabs.slice(0, 20),
    herds: Object.values(herds).sort((a, b) => {
      // Herds with recent activity first
      const aRecent = Math.max(...a.tabs.map(t => t.lastAccessed));
      const bRecent = Math.max(...b.tabs.map(t => t.lastAccessed));
      return bRecent - aRecent;
    }),
  };
}

// ─── Core: Organize Tabs ─────────────────────────────────────────────────────

async function organizeTabs() {
  const config = await chrome.storage.local.get(['rules', 'collapseInactive', 'ungroupedName', 'focusTopics', 'showNotification']);
  const rules = config.rules || DEFAULT_RULES;
  const focusTopics = config.focusTopics || [];

  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const results = [];
  let totalGrouped = 0;
  let totalTabs = 0;

  for (const win of windows) {
    const tabs = win.tabs.filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('edge://') && t.url !== 'about:blank');
    totalTabs += tabs.length;
    const result = await organizeWindow(win.id, tabs, rules, focusTopics, config);
    totalGrouped += result.grouped;
    results.push(result);
  }

  const timestamp = new Date().toISOString();
  await chrome.storage.local.set({ lastRun: timestamp });

  // Show notification (default: on, user can disable)
  if (config.showNotification !== false && totalTabs > 0) {
    // Request notification permission at runtime (optional_permissions)
    const hasPermission = await chrome.permissions.contains({ permissions: ['notifications'] });
    if (!hasPermission) {
      // Can't request from service worker without user gesture — skip silently
    } else {
      const groupNames = results.flatMap(r => r.groupNames || []);
      const uniqueGroups = [...new Set(groupNames)];
      chrome.notifications.create('herd-organized', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tabs organized',
        message: `${totalTabs} tabs → ${uniqueGroups.length} groups: ${uniqueGroups.slice(0, 4).join(', ')}${uniqueGroups.length > 4 ? '...' : ''}`,
        priority: 0,
      });
      setTimeout(() => chrome.notifications.clear('herd-organized'), 4000);
    }
  }

  return { success: true, windows: results.length, totalTabs, totalGrouped, timestamp };
}

async function organizeWindow(windowId, tabs, rules, focusTopics, config) {
  // Step 1: Classify each tab
  const classified = {};
  const focusGroup = [];

  for (const tab of tabs) {
    // Check focus topics first
    if (focusTopics.length > 0 && matchesFocus(tab, focusTopics)) {
      focusGroup.push(tab.id);
      continue;
    }

    const category = classifyTab(tab.url, rules);
    if (category) {
      if (!classified[category]) classified[category] = [];
      classified[category].push(tab.id);
    }
    // If no category matches, leave tab ungrouped (cleaner than a catch-all)
  }

  // Step 2: Remove existing tab groups in this window that herd manages
  // (We track which groups we created via title matching)
  const existingGroups = await chrome.tabGroups.query({ windowId });
  const herdGroupTitles = new Set([
    ...Object.keys(rules),
    ...(focusGroup.length > 0 ? ['Current Focus'] : []),
  ]);

  // Step 3: Apply tab groups
  // Focus group first (if any)
  const groupNames = [];

  if (focusGroup.length > 0) {
    await applyGroup(windowId, 'Current Focus', 'yellow', focusGroup, false);
    groupNames.push('🎯 Current Focus');
  }

  // Category groups
  for (const [category, tabIds] of Object.entries(classified)) {
    if (tabIds.length === 0) continue;
    const color = rules[category]?.color || 'grey';
    const collapsed = config.collapseInactive && focusGroup.length > 0;
    await applyGroup(windowId, category, color, tabIds, collapsed);
    groupNames.push(category);
  }

  return { windowId, grouped: Object.keys(classified).length + (focusGroup.length > 0 ? 1 : 0), groupNames };
}

async function applyGroup(windowId, title, color, tabIds, collapsed) {
  if (tabIds.length === 0) return;

  try {
    // Check if a group with this title already exists in this window
    const existingGroups = await chrome.tabGroups.query({ windowId, title });
    
    if (existingGroups.length > 0) {
      // Add tabs to existing group
      await chrome.tabs.group({ tabIds, groupId: existingGroups[0].id });
    } else {
      // Create new group
      const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title, color: mapColor(color), collapsed });
    }
  } catch (err) {
    console.warn(`herd: failed to group "${title}":`, err.message);
  }
}

// ─── Classification Engine ───────────────────────────────────────────────────

function classifyTab(url, rules) {
  for (const [category, config] of Object.entries(rules)) {
    for (const pattern of config.patterns || []) {
      if (matchPattern(url, pattern)) return category;
    }
  }
  return null;
}

function matchPattern(url, pattern) {
  if (typeof pattern !== 'string' || pattern.length > 500) return false;
  const normalizedUrl = url.replace(/^https?:\/\//, '').toLowerCase();
  const normalizedPattern = pattern.replace(/^https?:\/\//, '').toLowerCase();

  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  try {
    return new RegExp(`^${regexStr}$`).test(normalizedUrl);
  } catch {
    return normalizedUrl.includes(normalizedPattern);
  }
}

function matchesFocus(tab, topics) {
  const title = (tab.title || '').toLowerCase();
  const url = (tab.url || '').toLowerCase();
  return topics.some(topic => {
    const t = topic.toLowerCase();
    return title.includes(t) || url.includes(t);
  });
}

function mapColor(color) {
  const valid = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  return valid.includes(color) ? color : 'grey';
}

// ─── Native Messaging Bridge ─────────────────────────────────────────────────

const NATIVE_HOST = 'com.herd.bridge';
let nativePort = null;
let bridgeConnected = false;

function connectNativeBridge() {
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener((msg) => {
      if (chrome.runtime.lastError) return; // suppress
      if (msg.type === 'command') {
        handleBridgeCommand(msg);
      } else if (msg.type === 'bridge-ready') {
        bridgeConnected = true;
        sendStateToBridge();
      }
    });

    nativePort.onDisconnect.addListener(() => {
      // Must read lastError to suppress the "unchecked" warning
      const err = chrome.runtime.lastError;
      bridgeConnected = false;
      nativePort = null;
      // Retry connection after 60 seconds
      setTimeout(connectNativeBridge, 60000);
    });

    bridgeConnected = true;
    sendStateToBridge();
  } catch (err) {
    bridgeConnected = false;
    nativePort = null;
    console.log('herd: Native bridge not available (standalone mode)');
  }
}

async function sendStateToBridge() {
  if (!nativePort) return;

  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const tabs = [];
    for (const win of windows) {
      for (const tab of win.tabs) {
        if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
          tabs.push({ id: tab.id, title: tab.title, url: tab.url, windowId: win.id });
        }
      }
    }

    const config = await chrome.storage.local.get(['rules', 'enabled', 'lastRun', 'focusTopics', 'schedule']);

    nativePort.postMessage({
      type: 'state-update',
      data: {
        tabs,
        rules: config.rules || DEFAULT_RULES,
        enabled: config.enabled !== false,
        lastRun: config.lastRun,
        focusTopics: config.focusTopics || [],
        schedule: config.schedule || SCHEDULE_MINUTES,
      },
    });
  } catch {
    // Port disconnected — ignore
    bridgeConnected = false;
    nativePort = null;
  }
}

async function handleBridgeCommand(msg) {
  let result = { success: true };

  switch (msg.action) {
    case 'organize':
      if (msg.focusTopics) {
        await chrome.storage.local.set({ focusTopics: msg.focusTopics });
      }
      result = await organizeTabs();
      break;

    case 'set-focus':
      await chrome.storage.local.set({ focusTopics: msg.topics || [] });
      result = await organizeTabs();
      break;

    case 'add-rule': {
      const { rules } = await chrome.storage.local.get('rules');
      const currentRules = rules || DEFAULT_RULES;
      if (!currentRules[msg.category]) {
        currentRules[msg.category] = { patterns: [], color: msg.color || 'grey' };
      }
      if (!currentRules[msg.category].patterns.includes(msg.pattern)) {
        currentRules[msg.category].patterns.push(msg.pattern);
      }
      if (msg.color) currentRules[msg.category].color = msg.color;
      await chrome.storage.local.set({ rules: currentRules });
      result = { success: true, category: msg.category };
      break;
    }

    case 'remove-rule': {
      const { rules } = await chrome.storage.local.get('rules');
      const currentRules = rules || DEFAULT_RULES;
      if (msg.pattern && currentRules[msg.category]) {
        currentRules[msg.category].patterns = currentRules[msg.category].patterns.filter(p => p !== msg.pattern);
        if (currentRules[msg.category].patterns.length === 0) delete currentRules[msg.category];
      } else {
        delete currentRules[msg.category];
      }
      await chrome.storage.local.set({ rules: currentRules });
      result = { success: true };
      break;
    }
  }

  // Send response back to bridge
  if (nativePort && msg.id) {
    nativePort.postMessage({ type: 'response', id: msg.id, data: result });
  }

  // Update bridge with new state
  sendStateToBridge();
}

// Connect on startup
connectNativeBridge();

// Update bridge state periodically and after tab changes
chrome.tabs.onUpdated.addListener(() => sendStateToBridge());
chrome.tabs.onRemoved.addListener(() => sendStateToBridge());
chrome.tabs.onCreated.addListener(() => sendStateToBridge());

// ─── Status (updated to include bridge) ──────────────────────────────────────

async function getStatus() {
  const data = await chrome.storage.local.get(['enabled', 'lastRun', 'schedule', 'focusTopics']);
  return {
    enabled: data.enabled,
    lastRun: data.lastRun,
    schedule: data.schedule,
    focusTopics: data.focusTopics || [],
    bridgeConnected,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
const MAX_CATEGORIES = 50;
const MAX_PATTERNS_PER_CATEGORY = 100;
const MAX_PATTERN_LENGTH = 500;

function validateRules(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return false;
  const keys = Object.keys(rules);
  if (keys.length > MAX_CATEGORIES) return false;
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
    const cat = rules[key];
    if (!cat || typeof cat !== 'object' || Array.isArray(cat)) return false;
    if (!Array.isArray(cat.patterns)) return false;
    if (cat.patterns.length > MAX_PATTERNS_PER_CATEGORY) return false;
    for (const p of cat.patterns) {
      if (typeof p !== 'string' || p.length > MAX_PATTERN_LENGTH) return false;
    }
    if (cat.color && !VALID_COLORS.includes(cat.color)) return false;
  }
  return true;
}
