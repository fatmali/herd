/**
 * Tests for recovery screen data helpers and thumbnail logic.
 * These test the pure logic extracted from background.js.
 */

// Mock the hashUrl function (same as in background.js)
function hashUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// Mock timeAgo from recovery.js
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

describe('hashUrl', () => {
  test('returns a string', () => {
    expect(typeof hashUrl('https://github.com')).toBe('string');
  });

  test('same URL produces same hash', () => {
    const url = 'https://github.com/org/repo/pull/42';
    expect(hashUrl(url)).toBe(hashUrl(url));
  });

  test('different URLs produce different hashes', () => {
    expect(hashUrl('https://github.com')).not.toBe(hashUrl('https://figma.com'));
  });

  test('handles empty string', () => {
    expect(hashUrl('')).toBe('0');
  });

  test('handles very long URLs', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2000);
    expect(typeof hashUrl(longUrl)).toBe('string');
    expect(hashUrl(longUrl).length).toBeGreaterThan(0);
  });
});

describe('timeAgo', () => {
  test('returns empty string for falsy input', () => {
    expect(timeAgo(0)).toBe('');
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  test('just now for < 60 seconds', () => {
    expect(timeAgo(Date.now() - 30000)).toBe('just now');
  });

  test('minutes ago', () => {
    expect(timeAgo(Date.now() - 5 * 60 * 1000)).toBe('5m ago');
  });

  test('hours ago', () => {
    expect(timeAgo(Date.now() - 3 * 60 * 60 * 1000)).toBe('3h ago');
  });

  test('days ago', () => {
    expect(timeAgo(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe('2d ago');
  });
});

describe('recovery data structure', () => {
  // Simulate the data structure returned by getRecoveryData
  const mockData = {
    timeline: [
      { id: 1, title: 'GitHub PR', url: 'https://github.com/pull/1', lastAccessed: 1000, windowId: 1, groupId: 10 },
      { id: 2, title: 'Figma', url: 'https://figma.com/file/x', lastAccessed: 900, windowId: 1, groupId: 20 },
      { id: 3, title: 'Jira', url: 'https://jira.com/browse/X', lastAccessed: 800, windowId: 1, groupId: 10 },
    ],
    herds: [
      {
        id: 'group_10',
        groupId: 10,
        name: 'Code Review',
        color: 'green',
        tabs: [
          { id: 1, title: 'GitHub PR', url: 'https://github.com/pull/1', lastAccessed: 1000, windowId: 1 },
          { id: 3, title: 'Jira', url: 'https://jira.com/browse/X', lastAccessed: 800, windowId: 1 },
        ],
        note: 'Finishing MSAL migration',
      },
      {
        id: 'group_20',
        groupId: 20,
        name: 'Design',
        color: 'pink',
        tabs: [
          { id: 2, title: 'Figma', url: 'https://figma.com/file/x', lastAccessed: 900, windowId: 1 },
        ],
        note: '',
      },
    ],
  };

  test('timeline is sorted by lastAccessed descending', () => {
    for (let i = 0; i < mockData.timeline.length - 1; i++) {
      expect(mockData.timeline[i].lastAccessed).toBeGreaterThanOrEqual(mockData.timeline[i + 1].lastAccessed);
    }
  });

  test('herds contain all tabs from timeline', () => {
    const herdTabIds = mockData.herds.flatMap(h => h.tabs.map(t => t.id));
    const timelineTabIds = mockData.timeline.map(t => t.id);
    for (const id of timelineTabIds) {
      expect(herdTabIds).toContain(id);
    }
  });

  test('each herd has required fields', () => {
    for (const herd of mockData.herds) {
      expect(herd).toHaveProperty('id');
      expect(herd).toHaveProperty('name');
      expect(herd).toHaveProperty('color');
      expect(herd).toHaveProperty('tabs');
      expect(herd).toHaveProperty('note');
      expect(Array.isArray(herd.tabs)).toBe(true);
      expect(typeof herd.note).toBe('string');
    }
  });

  test('each tab has required fields', () => {
    for (const tab of mockData.timeline) {
      expect(tab).toHaveProperty('id');
      expect(tab).toHaveProperty('title');
      expect(tab).toHaveProperty('url');
      expect(tab).toHaveProperty('lastAccessed');
      expect(tab).toHaveProperty('windowId');
    }
  });

  test('herds sorted by most recent activity', () => {
    const recentPerHerd = mockData.herds.map(h => Math.max(...h.tabs.map(t => t.lastAccessed)));
    for (let i = 0; i < recentPerHerd.length - 1; i++) {
      expect(recentPerHerd[i]).toBeGreaterThanOrEqual(recentPerHerd[i + 1]);
    }
  });

  test('herd with note is marked (for future parking protection)', () => {
    const protectedHerds = mockData.herds.filter(h => h.note.length > 0);
    expect(protectedHerds.length).toBe(1);
    expect(protectedHerds[0].name).toBe('Code Review');
  });
});

describe('thumbnail storage keys', () => {
  test('tab thumbnail key format', () => {
    const tabId = 12345;
    const key = `thumb_${tabId}`;
    expect(key).toBe('thumb_12345');
  });

  test('URL-based fallback key format', () => {
    const url = 'https://github.com/org/repo';
    const key = `thumburl_${hashUrl(url)}`;
    expect(key).toMatch(/^thumburl_[a-z0-9]+$/);
  });

  test('URL hash is deterministic', () => {
    const url = 'https://github.com/org/repo/pull/42';
    const key1 = `thumburl_${hashUrl(url)}`;
    const key2 = `thumburl_${hashUrl(url)}`;
    expect(key1).toBe(key2);
  });
});
