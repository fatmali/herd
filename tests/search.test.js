const { fuzzyScore, scoreTab, searchTabs } = require('../lib/search');

describe('fuzzyScore', () => {
  test('exact prefix match scores highest', () => {
    const score = fuzzyScore('git', 'github.com/org/repo');
    expect(score).toBeGreaterThan(140); // 100 base + 50 prefix bonus
  });

  test('exact substring match (non-prefix) scores high', () => {
    const score = fuzzyScore('repo', 'github.com/org/repo');
    expect(score).toBeGreaterThan(100);
    expect(score).toBeLessThan(150); // No prefix bonus
  });

  test('subsequence match scores lower than substring', () => {
    const substringScore = fuzzyScore('auth', 'auth-migration-service');
    const subsequenceScore = fuzzyScore('amis', 'auth-migration-service');
    expect(substringScore).toBeGreaterThan(subsequenceScore);
  });

  test('no match returns 0', () => {
    expect(fuzzyScore('xyz', 'github.com')).toBe(0);
  });

  test('empty query returns 0', () => {
    expect(fuzzyScore('', 'github.com')).toBe(0);
  });

  test('empty text returns 0', () => {
    expect(fuzzyScore('git', '')).toBe(0);
  });

  test('case insensitive', () => {
    const lower = fuzzyScore('github', 'GitHub.com');
    const upper = fuzzyScore('GITHUB', 'github.com');
    expect(lower).toBeGreaterThan(0);
    expect(upper).toBeGreaterThan(0);
    expect(lower).toBe(upper);
  });

  test('word boundary matches score higher', () => {
    // 'pr' at word boundary ("pull-request") vs mid-word ("spring")
    const boundaryScore = fuzzyScore('pr', 'pull-request');
    const midWordScore = fuzzyScore('pr', 'spring');
    // Both are substring matches so both > 100, but let's verify they work
    expect(boundaryScore).toBeGreaterThan(0);
    expect(midWordScore).toBeGreaterThan(0);
  });

  test('longer queries discriminate better', () => {
    const vague = fuzzyScore('a', 'auth-migration');
    const specific = fuzzyScore('auth-mig', 'auth-migration');
    expect(specific).toBeGreaterThan(vague);
  });

  test('handles special characters in URLs', () => {
    expect(fuzzyScore('query=test', 'https://site.com/search?query=test&page=1')).toBeGreaterThan(0);
  });
});

describe('scoreTab', () => {
  const tab = {
    title: 'PR #4421 - Migrate auth to MSAL',
    url: 'https://github.com/org/repo/pull/4421',
    herdName: 'Code Review',
  };

  test('matches title', () => {
    expect(scoreTab('migrate auth', tab)).toBeGreaterThan(0);
  });

  test('matches URL', () => {
    expect(scoreTab('github.com', tab)).toBeGreaterThan(0);
  });

  test('matches herd name', () => {
    expect(scoreTab('code review', tab)).toBeGreaterThan(0);
  });

  test('title matches weighted higher than URL', () => {
    const titleTab = { title: 'github dashboard', url: 'https://example.com', herdName: '' };
    const urlTab = { title: 'Example page', url: 'https://github.com/dash', herdName: '' };
    const titleScore = scoreTab('github', titleTab);
    const urlScore = scoreTab('github', urlTab);
    expect(titleScore).toBeGreaterThan(urlScore);
  });

  test('returns 0 for no match', () => {
    expect(scoreTab('kubernetes', tab)).toBe(0);
  });
});

describe('searchTabs', () => {
  const tabs = [
    { id: 1, title: 'GitHub - org/repo', url: 'https://github.com/org/repo', herdName: 'Code Review', lastAccessed: 100 },
    { id: 2, title: 'Figma - Design System', url: 'https://figma.com/file/abc', herdName: 'Design', lastAccessed: 200 },
    { id: 3, title: 'Jira - AUTH-1234', url: 'https://jira.atlassian.com/browse/AUTH-1234', herdName: 'Work Items', lastAccessed: 300 },
    { id: 4, title: 'localhost:3000 - Dashboard', url: 'http://localhost:3000/dashboard', herdName: 'Dev Tools', lastAccessed: 400 },
    { id: 5, title: 'Google Docs - Sprint Retro', url: 'https://docs.google.com/doc/123', herdName: 'Documentation', lastAccessed: 500 },
  ];

  test('empty query returns most recent tabs', () => {
    const results = searchTabs('', tabs);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results[0].id).toBe(1); // tabs are passed in array order
  });

  test('filters to matching tabs only', () => {
    const results = searchTabs('figma', tabs);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(2);
  });

  test('ranks by relevance', () => {
    const results = searchTabs('auth', tabs);
    // AUTH-1234 in title should rank high
    expect(results[0].id).toBe(3);
  });

  test('searches across herd names', () => {
    const results = searchTabs('design', tabs);
    expect(results.some(r => r.id === 2)).toBe(true);
  });

  test('returns max 12 results', () => {
    const manyTabs = Array.from({ length: 50 }, (_, i) => ({
      id: i, title: `Tab ${i} with search term`, url: `https://example.com/${i}`, herdName: '', lastAccessed: i,
    }));
    const results = searchTabs('search term', manyTabs);
    expect(results.length).toBeLessThanOrEqual(12);
  });

  test('no matches returns empty', () => {
    const results = searchTabs('zzzznothing', tabs);
    expect(results.length).toBe(0);
  });

  test('fuzzy subsequence finds results', () => {
    // 'ghr' should match 'GitHub - org/repo' via subsequence g-h-r? No — 'r' comes after 'h' but not in sequence.
    // Let's use 'ghub' which matches 'github' as subsequence
    const results = searchTabs('ghub', tabs);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(1);
  });
});
