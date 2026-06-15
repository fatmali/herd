// options.js - Herd extension settings page

const COLOR_MAP = {
  grey: '#999', blue: '#4285f4', red: '#ea4335', yellow: '#fbbc04',
  green: '#34a853', pink: '#e91e8a', purple: '#9334e6', cyan: '#00bcd4', orange: '#ff6d01',
};

document.addEventListener('DOMContentLoaded', async () => {
  const rulesList = document.getElementById('rulesList');
  const addBtn = document.getElementById('addBtn');
  const scheduleSelect = document.getElementById('scheduleSelect');
  const collapseCheck = document.getElementById('collapseCheck');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const resetBtn = document.getElementById('resetBtn');

  let config = await chrome.storage.local.get(['rules', 'schedule', 'collapseInactive']);

  // Render rules
  function renderRules() {
    rulesList.innerHTML = '';
    const rules = config.rules || {};
    for (const [name, rule] of Object.entries(rules)) {
      const row = document.createElement('div');
      row.className = 'rule-row';

      const patternsHtml = (rule.patterns || [])
        .map(p => `<span class="pattern" data-category="${escapeHtml(name)}" data-pattern="${escapeHtml(p)}" title="Click to remove">${escapeHtml(p)}</span>`)
        .join('');

      row.innerHTML = `
        <div class="color-dot" style="background: ${COLOR_MAP[rule.color] || COLOR_MAP.grey}" data-name="${escapeHtml(name)}" title="Click to change color"></div>
        <div class="rule-name" data-name="${escapeHtml(name)}" title="Click to rename">${escapeHtml(name)}</div>
        <div class="rule-patterns">
          ${patternsHtml}
          <input type="text" class="inline-add" data-category="${escapeHtml(name)}" placeholder="+ add pattern" title="Type a URL pattern and press Enter">
        </div>
        <div class="rule-actions">
          <button data-name="${escapeHtml(name)}" title="Remove category">&times;</button>
        </div>
      `;
      rulesList.appendChild(row);
    }

    // Delete category handlers
    rulesList.querySelectorAll('.rule-actions button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (confirm(`Delete category "${name}" and all its patterns?`)) {
          delete config.rules[name];
          await chrome.storage.local.set({ rules: config.rules });
          renderRules();
        }
      });
    });

    // Click pattern to remove it
    rulesList.querySelectorAll('.pattern').forEach(chip => {
      chip.addEventListener('click', async () => {
        const category = chip.dataset.category;
        const pattern = chip.dataset.pattern;
        const patterns = config.rules[category]?.patterns || [];
        config.rules[category].patterns = patterns.filter(p => p !== pattern);
        if (config.rules[category].patterns.length === 0) {
          delete config.rules[category];
        }
        await chrome.storage.local.set({ rules: config.rules });
        renderRules();
      });
    });

    // Inline add pattern (press Enter)
    rulesList.querySelectorAll('.inline-add').forEach(input => {
      input.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const pattern = input.value.trim();
        const category = input.dataset.category;
        if (!pattern || !config.rules[category]) return;

        if (!config.rules[category].patterns.includes(pattern)) {
          config.rules[category].patterns.push(pattern);
          await chrome.storage.local.set({ rules: config.rules });
        }
        renderRules();
      });
    });

    // Click color dot to cycle colors
    rulesList.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', async () => {
        const name = dot.dataset.name;
        const colors = Object.keys(COLOR_MAP);
        const current = config.rules[name]?.color || 'grey';
        const nextIdx = (colors.indexOf(current) + 1) % colors.length;
        config.rules[name].color = colors[nextIdx];
        await chrome.storage.local.set({ rules: config.rules });
        renderRules();
      });
    });

    // Click name to rename
    rulesList.querySelectorAll('.rule-name').forEach(el => {
      el.addEventListener('click', async () => {
        const oldName = el.dataset.name;
        const newName = prompt('Rename category:', oldName);
        if (newName && newName !== oldName && !config.rules[newName]) {
          config.rules[newName] = config.rules[oldName];
          delete config.rules[oldName];
          await chrome.storage.local.set({ rules: config.rules });
          renderRules();
        }
      });
    });
  }

  renderRules();

  // Schedule
  scheduleSelect.value = String(config.schedule || 60);
  scheduleSelect.addEventListener('change', async () => {
    const minutes = parseInt(scheduleSelect.value);
    await chrome.storage.local.set({ schedule: minutes });
    // Update alarm
    if (minutes > 0) {
      chrome.alarms.clear('herd-organize');
      chrome.alarms.create('herd-organize', { periodInMinutes: minutes });
    } else {
      chrome.alarms.clear('herd-organize');
    }
  });

  // Collapse
  collapseCheck.checked = config.collapseInactive !== false;
  collapseCheck.addEventListener('change', async () => {
    await chrome.storage.local.set({ collapseInactive: collapseCheck.checked });
  });

  // Add new category
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const newCategoryName = document.getElementById('newCategoryName');

  addCategoryBtn.addEventListener('click', async () => {
    const name = newCategoryName.value.trim();
    const color = document.getElementById('newColor').value;
    if (!name) { newCategoryName.focus(); return; }
    if (config.rules[name]) { alert(`Category "${name}" already exists.`); return; }

    config.rules[name] = { patterns: [], color };
    await chrome.storage.local.set({ rules: config.rules });
    newCategoryName.value = '';
    renderRules();
    // Focus the inline input of the new category so user can immediately add patterns
    setTimeout(() => {
      const input = rulesList.querySelector(`.inline-add[data-category="${name}"]`);
      if (input) input.focus();
    }, 100);
  });

  // Export
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(config.rules, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'herd-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text);
        config.rules = { ...config.rules, ...imported };
        await chrome.storage.local.set({ rules: config.rules });
        renderRules();
      } catch {
        alert('Invalid JSON file');
      }
    });
    input.click();
  });

  // Reset
  resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all rules to defaults? Your custom rules will be lost.')) {
      // Get defaults from background
      config.rules = null;
      await chrome.storage.local.remove('rules');
      // Reload to pick up defaults
      location.reload();
    }
  });

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
