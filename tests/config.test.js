const { loadConfig, DEFAULTS } = require('../lib/config');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('config', () => {
  test('DEFAULTS has expected structure', () => {
    expect(DEFAULTS.browsers).toBeDefined();
    expect(DEFAULTS.browsers).toBeInstanceOf(Array);
    expect(DEFAULTS.categories).toBeDefined();
    expect(DEFAULTS.strategy).toBe('activity-type');
    expect(DEFAULTS.collapseInactiveGroups).toBe(true);
    expect(DEFAULTS.closeStaleTabs).toBe(false);
  });

  test('DEFAULTS has common categories', () => {
    const names = Object.keys(DEFAULTS.categories);
    expect(names).toContain('Code Review');
    expect(names).toContain('Email');
    expect(names).toContain('Local Dev');
  });

  test('each category has patterns array and color', () => {
    for (const [name, cat] of Object.entries(DEFAULTS.categories)) {
      expect(cat.patterns).toBeInstanceOf(Array);
      expect(cat.patterns.length).toBeGreaterThan(0);
      expect(cat.color).toBeDefined();
    }
  });

  test('loadConfig returns defaults when no user config exists', () => {
    const config = loadConfig();
    expect(config.strategy).toBe('activity-type');
    expect(config.browsers).toBeDefined();
  });

  test('CONFIG_PATHS includes home directory', () => {
    const { CONFIG_PATHS } = require('../lib/config');
    const homePath = path.join(os.homedir(), '.herd.json');
    expect(CONFIG_PATHS).toContain(homePath);
  });
});
