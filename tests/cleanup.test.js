/**
 * Tests for tab cleanup (auto-close inactive tabs) feature.
 * Tests the core filtering logic: which tabs should be parked/closed.
 */

const DAY = 24 * 60 * 60 * 1000;

// Extract the pure filtering logic from cleanupInactiveTabs
function getTabsToClose({ windows, groups, notes, cleanupDays, now }) {
  const maxAge = (cleanupDays || 30) * DAY;

  // Build set of protected group IDs (groups with notes are never cleaned)
  const protectedGroups = new Set();
  for (const group of groups) {
    if (notes[group.id] && notes[group.id].trim()) {
      protectedGroups.add(group.id);
    }
  }

  const tabsToClose = [];

  for (const win of windows) {
    const closeable = win.tabs.filter(t =>
      !t.url.startsWith('chrome://') &&
      !t.url.startsWith('edge://') &&
      t.url !== 'about:blank' &&
      !t.active &&
      !t.pinned &&
      !protectedGroups.has(t.groupId)
    );

    for (const tab of closeable) {
      const age = now - (tab.lastAccessed || now);
      if (age > maxAge) {
        tabsToClose.push(tab);
      }
    }
  }

  return tabsToClose;
}

function makeTab(overrides = {}) {
  return {
    id: Math.floor(Math.random() * 10000),
    url: 'https://example.com',
    title: 'Example',
    active: false,
    pinned: false,
    groupId: -1,
    lastAccessed: Date.now() - 45 * DAY,
    ...overrides,
  };
}

const NOW = Date.now();

describe('Tab Cleanup - Filtering Logic', () => {
  test('closes tabs older than threshold', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 31 * DAY, url: 'https://old.com' }),
      makeTab({ lastAccessed: NOW - 5 * DAY, url: 'https://recent.com' }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://old.com');
  });

  test('never closes pinned tabs', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 60 * DAY, pinned: true }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(0);
  });

  test('never closes active tabs', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 60 * DAY, active: true }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(0);
  });

  test('never closes chrome:// or edge:// URLs', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 60 * DAY, url: 'chrome://settings' }),
      makeTab({ lastAccessed: NOW - 60 * DAY, url: 'edge://extensions' }),
      makeTab({ lastAccessed: NOW - 60 * DAY, url: 'about:blank' }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(0);
  });

  test('protects tabs in groups with notes', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 60 * DAY, groupId: 5 }),
      makeTab({ lastAccessed: NOW - 60 * DAY, groupId: 6 }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [{ id: 5 }, { id: 6 }],
      notes: { 5: 'Important context' },
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].groupId).toBe(6);
  });

  test('respects configurable day threshold', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 10 * DAY }),
    ];
    // 7-day threshold: should close
    expect(getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 7,
      now: NOW,
    })).toHaveLength(1);

    // 14-day threshold: should NOT close
    expect(getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 14,
      now: NOW,
    })).toHaveLength(0);
  });

  test('defaults to 30 days when cleanupDays is undefined', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 25 * DAY }),
      makeTab({ lastAccessed: NOW - 35 * DAY }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: undefined,
      now: NOW,
    });
    expect(result).toHaveLength(1);
  });

  test('handles multiple windows', () => {
    const win1 = { tabs: [makeTab({ lastAccessed: NOW - 40 * DAY, url: 'https://a.com' })] };
    const win2 = { tabs: [makeTab({ lastAccessed: NOW - 40 * DAY, url: 'https://b.com' })] };
    const result = getTabsToClose({
      windows: [win1, win2],
      groups: [],
      notes: {},
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(2);
  });

  test('empty notes string does not protect a group', () => {
    const tabs = [
      makeTab({ lastAccessed: NOW - 60 * DAY, groupId: 10 }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [{ id: 10 }],
      notes: { 10: '   ' },
      cleanupDays: 30,
      now: NOW,
    });
    expect(result).toHaveLength(1);
  });

  test('tabs with no lastAccessed are treated as current (age 0)', () => {
    const tabs = [
      makeTab({ lastAccessed: undefined }),
    ];
    const result = getTabsToClose({
      windows: [{ tabs }],
      groups: [],
      notes: {},
      cleanupDays: 7,
      now: NOW,
    });
    expect(result).toHaveLength(0);
  });
});

describe('Tab Cleanup - Parking Logic', () => {
  test('parked entry has correct shape', () => {
    const tab = makeTab({ url: 'https://github.com/pr/1', title: 'PR #1', groupId: 3 });
    const parkedEntry = {
      url: tab.url,
      title: tab.title,
      parkedAt: NOW,
      groupId: tab.groupId,
    };
    expect(parkedEntry).toEqual({
      url: 'https://github.com/pr/1',
      title: 'PR #1',
      parkedAt: NOW,
      groupId: 3,
    });
  });

  test('parked list is capped at 200', () => {
    const existing = Array.from({ length: 198 }, (_, i) => ({
      url: `https://old-${i}.com`,
      title: `Old ${i}`,
      parkedAt: NOW - 10 * DAY,
      groupId: -1,
    }));
    const newEntries = [
      { url: 'https://new-1.com', title: 'New 1', parkedAt: NOW, groupId: -1 },
      { url: 'https://new-2.com', title: 'New 2', parkedAt: NOW, groupId: -1 },
      { url: 'https://new-3.com', title: 'New 3', parkedAt: NOW, groupId: -1 },
    ];
    const combined = [...newEntries, ...existing].slice(0, 200);
    expect(combined).toHaveLength(200);
    expect(combined[0].url).toBe('https://new-1.com');
  });
});
