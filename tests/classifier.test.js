const { matchPattern, classifyTab, classifyAll, classifyWithContext } = require('../lib/classifier');

describe('matchPattern', () => {
  test('matches exact domain with wildcard', () => {
    expect(matchPattern('https://github.com/org/repo', '*github.com*')).toBe(true);
  });

  test('matches wildcard in path', () => {
    expect(matchPattern('https://github.com/myorg/repo/pull/42', '*github.com/*/pull/*')).toBe(true);
  });

  test('matches leading wildcard', () => {
    expect(matchPattern('https://portal.microsofticm.com/incidents/123', '*microsofticm.com*')).toBe(true);
  });

  test('matches localhost with port', () => {
    expect(matchPattern('http://localhost:3000/dashboard', 'localhost:*')).toBe(true);
  });

  test('does not match unrelated URL', () => {
    expect(matchPattern('https://youtube.com/watch', 'github.com*')).toBe(false);
  });

  test('is case insensitive', () => {
    expect(matchPattern('https://GitHub.COM/org/repo', '*github.com*')).toBe(true);
  });

  test('strips protocol before matching', () => {
    expect(matchPattern('https://docs.microsoft.com/graph', 'docs.*')).toBe(true);
  });

  test('matches visualstudio pullrequest pattern', () => {
    expect(matchPattern(
      'https://office.visualstudio.com/Office/_git/1JS/pullrequest/5303194',
      '*.visualstudio.com/*pullrequest*'
    )).toBe(true);
  });

  test('matches azure devops backlogs', () => {
    expect(matchPattern(
      'https://dev.azure.com/office/OC/_backlogs/backlog/FTL/Features',
      '*dev.azure.com/*/_backlogs*'
    )).toBe(true);
  });

  test('rejects patterns longer than 500 chars', () => {
    expect(matchPattern('https://example.com', 'a'.repeat(501))).toBe(false);
  });
});

describe('classifyTab', () => {
  const categories = {
    'Code Review': { patterns: ['*github.com/*/pull/*', '*.visualstudio.com/*pullrequest*'], color: 'green' },
    'Email': { patterns: ['outlook.office.com*'], color: 'yellow' },
    'Local Dev': { patterns: ['localhost:*', '127.0.0.1:*'], color: 'cyan' },
  };

  test('classifies a GitHub PR', () => {
    const tab = { url: 'https://github.com/org/repo/pull/42' };
    expect(classifyTab(tab, categories)).toBe('Code Review');
  });

  test('classifies Outlook', () => {
    const tab = { url: 'https://outlook.office.com/mail/inbox' };
    expect(classifyTab(tab, categories)).toBe('Email');
  });

  test('classifies localhost', () => {
    const tab = { url: 'http://localhost:8080/api' };
    expect(classifyTab(tab, categories)).toBe('Local Dev');
  });

  test('returns ungrouped for unknown URL', () => {
    const tab = { url: 'https://youtube.com/watch?v=abc' };
    expect(classifyTab(tab, categories, 'Other')).toBe('Other');
  });

  test('classifies ADO pull request', () => {
    const tab = { url: 'https://office.visualstudio.com/Office/_git/1JS/pullrequest/5303194' };
    expect(classifyTab(tab, categories)).toBe('Code Review');
  });
});

describe('classifyAll', () => {
  const categories = {
    'Code Review': { patterns: ['*github.com/*/pull/*'], color: 'green' },
    'Email': { patterns: ['outlook.office.com*'], color: 'yellow' },
  };

  const tabs = [
    { id: '1', title: 'PR #42', url: 'https://github.com/org/repo/pull/42' },
    { id: '2', title: 'Outlook', url: 'https://outlook.office.com/mail' },
    { id: '3', title: 'YouTube', url: 'https://youtube.com/watch' },
    { id: '4', title: 'New Tab', url: 'chrome://newtab' },
  ];

  test('groups tabs by category', () => {
    const groups = classifyAll(tabs, categories, 'Other');
    expect(groups['Code Review']).toHaveLength(1);
    expect(groups['Email']).toHaveLength(1);
    expect(groups['Other']).toHaveLength(1);
  });

  test('skips internal browser pages', () => {
    const groups = classifyAll(tabs, categories, 'Other');
    const allGroupedUrls = Object.values(groups).flat().map(t => t.url);
    expect(allGroupedUrls).not.toContain('chrome://newtab');
  });

  test('returns empty groups object for no tabs', () => {
    const groups = classifyAll([], categories, 'Other');
    expect(Object.keys(groups)).toHaveLength(0);
  });
});

describe('classifyWithContext', () => {
  const categories = {
    'Code Review': { patterns: ['*github.com/*/pull/*'], color: 'green' },
    'Documentation': { patterns: ['docs.*'], color: 'purple' },
  };

  const tabs = [
    { id: '1', title: 'PR - Migrate auth to MSAL', url: 'https://github.com/org/repo/pull/42' },
    { id: '2', title: 'Graph API docs', url: 'https://docs.microsoft.com/graph' },
    { id: '3', title: 'Auth migration design', url: 'https://docs.google.com/auth-migration' },
    { id: '4', title: 'Random video', url: 'https://youtube.com/watch' },
  ];

  test('promotes matching tabs to Current Focus', () => {
    const context = { focusTopics: ['auth'] };
    const groups = classifyWithContext(tabs, categories, context, 'Other');
    
    expect(groups['🎯 Current Focus']).toBeDefined();
    const focusTitles = groups['🎯 Current Focus'].map(t => t.title);
    expect(focusTitles).toContain('PR - Migrate auth to MSAL');
    expect(focusTitles).toContain('Auth migration design');
  });

  test('non-matching tabs stay in their category', () => {
    const context = { focusTopics: ['auth'] };
    const groups = classifyWithContext(tabs, categories, context, 'Other');
    
    expect(groups['Documentation'].map(t => t.title)).toContain('Graph API docs');
  });

  test('with no focus topics, behaves like classifyAll', () => {
    const context = { focusTopics: [] };
    const groups = classifyWithContext(tabs, categories, context, 'Other');
    
    expect(groups['🎯 Current Focus']).toBeUndefined();
    expect(groups['Code Review']).toHaveLength(1);
  });

  test('with null context, behaves like classifyAll', () => {
    const groups = classifyWithContext(tabs, categories, null, 'Other');
    expect(groups['🎯 Current Focus']).toBeUndefined();
  });

  test('matches focus in URL as well as title', () => {
    const context = { focusTopics: ['graph'] };
    const groups = classifyWithContext(tabs, categories, context, 'Other');
    
    const focusTitles = groups['🎯 Current Focus'].map(t => t.title);
    expect(focusTitles).toContain('Graph API docs');
  });
});
