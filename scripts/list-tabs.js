#!/usr/bin/env node
/**
 * herd — list all open browser tabs
 * Usage: node scripts/list-tabs.js [--json] [--port 9222]
 */

const { listTabs } = require('../lib/cdp');
const { loadConfig } = require('../lib/config');

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const portIdx = args.indexOf('--port');
  const config = loadConfig();

  let browsers = config.browsers;
  if (portIdx !== -1 && args[portIdx + 1]) {
    browsers = [{ name: 'Custom', port: parseInt(args[portIdx + 1]) }];
  }

  const tabs = await listTabs(browsers);

  if (tabs.length === 0) {
    console.error('No tabs found. Is your browser running with --remote-debugging-port?');
    console.error('Run: node scripts/setup-browser.js --help');
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(tabs, null, 2));
  } else {
    console.log(`\n🐑 Found ${tabs.length} tab(s):\n`);
    const byBrowser = {};
    for (const tab of tabs) {
      const key = `${tab.browserName} (:${tab.browserPort})`;
      if (!byBrowser[key]) byBrowser[key] = [];
      byBrowser[key].push(tab);
    }

    for (const [browser, browserTabs] of Object.entries(byBrowser)) {
      console.log(`  ${browser} — ${browserTabs.length} tabs`);
      for (const tab of browserTabs) {
        const title = (tab.title || 'Untitled').substring(0, 60);
        const url = (tab.url || '').substring(0, 80);
        console.log(`    • ${title}`);
        console.log(`      ${url}`);
      }
      console.log('');
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
