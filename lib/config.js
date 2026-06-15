/**
 * herd — config loader
 * Loads user config from ~/.herd.json, falling back to defaults.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILENAME = '.herd.json';
const CONFIG_PATHS = [
  path.join(os.homedir(), CONFIG_FILENAME),
  path.join(process.cwd(), 'config.json'),
  path.join(__dirname, '..', 'config.example.json'),
];

const DEFAULTS = {
  browsers: [
    { name: 'Edge', port: 9222 },
    { name: 'Chrome', port: 9223 },
  ],
  strategy: 'activity-type',
  categories: {
    'Code Review': { patterns: ['github.com/*/pull/', 'dev.azure.com/*/pullrequest/'], color: 'green' },
    'Documentation': { patterns: ['*wiki*', 'docs.*', 'learn.microsoft.com'], color: 'purple' },
    'Email': { patterns: ['outlook.office.com', 'mail.google.com'], color: 'yellow' },
    'Meetings & Chat': { patterns: ['teams.microsoft.com', 'zoom.us'], color: 'red' },
    'Local Dev': { patterns: ['localhost:*', '127.0.0.1:*'], color: 'cyan' },
  },
  closeStaleTabs: false,
  staleThresholdHours: 24,
  collapseInactiveGroups: true,
  useWorkContext: true,
  currentFocusColor: 'yellow',
  ungroupedCategory: 'Other',
};

function loadConfig() {
  for (const configPath of CONFIG_PATHS) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(raw);
        return { ...DEFAULTS, ...userConfig };
      }
    } catch (err) {
      // Skip malformed config, try next
    }
  }
  return DEFAULTS;
}

module.exports = { loadConfig, DEFAULTS, CONFIG_PATHS };
