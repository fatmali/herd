// popup.js - Herd extension popup controller

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const organizeBtn = document.getElementById('organizeBtn');
  const ungroupBtn = document.getElementById('ungroupBtn');
  const enabledToggle = document.getElementById('enabledToggle');
  const notifyToggle = document.getElementById('notifyToggle');
  const optionsLink = document.getElementById('optionsLink');

  // Load current status
  const status = await chrome.runtime.sendMessage({ action: 'get-status' });
  updateStatus(status);

  // Load notification preference
  const { showNotification } = await chrome.storage.local.get('showNotification');
  notifyToggle.checked = showNotification !== false;

  // Organize now
  organizeBtn.addEventListener('click', async () => {
    organizeBtn.textContent = 'Organizing...';
    organizeBtn.disabled = true;
    await chrome.runtime.sendMessage({ action: 'organize-now' });
    organizeBtn.textContent = 'Done!';
    setTimeout(() => {
      organizeBtn.textContent = 'Organize Now';
      organizeBtn.disabled = false;
    }, 1500);
    refreshStatus();
  });

  // Ungroup all
  ungroupBtn.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    for (const tab of tabs) {
      if (tab.groupId !== -1) {
        try { await chrome.tabs.ungroup(tab.id); } catch {}
      }
    }
    ungroupBtn.textContent = 'Ungrouped!';
    setTimeout(() => { ungroupBtn.textContent = 'Ungroup All'; }, 1500);
  });

  // Toggle auto-organize
  enabledToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: enabledToggle.checked });
    refreshStatus();
  });

  // Toggle notifications
  notifyToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ showNotification: notifyToggle.checked });
  });

  // Options page
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // AI Agent connection status
  const aiStatus = document.getElementById('aiStatus');
  const aiDot = document.getElementById('aiDot');
  const aiHint = document.getElementById('aiHint');

  async function checkAiConnection() {
    try {
      const res = await fetch('http://127.0.0.1:9922/health', { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        aiDot.className = 'status-dot';
        aiStatus.textContent = 'Connected';
        aiHint.innerHTML = 'Your AI agent can organize tabs. Try:<br><code>"Organize my tabs"</code>';
      } else {
        throw new Error();
      }
    } catch {
      aiDot.className = 'status-dot off';
      aiStatus.textContent = 'Not connected';
      aiHint.innerHTML = 'Run <code>npx herd-tabs --install</code> to enable AI control.';
    }
  }
  checkAiConnection();

  function updateStatus(status) {
    enabledToggle.checked = status.enabled !== false;
    statusDot.className = 'status-dot' + (status.enabled === false ? ' off' : '');

    if (status.lastRun) {
      const ago = timeAgo(new Date(status.lastRun));
      statusText.textContent = `Last organized ${ago}`;
    } else {
      statusText.textContent = 'Not yet organized';
    }
  }

  async function refreshStatus() {
    const s = await chrome.runtime.sendMessage({ action: 'get-status' });
    updateStatus(s);
  }

  function timeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
});
