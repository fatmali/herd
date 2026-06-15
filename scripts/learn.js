#!/usr/bin/env node
/**
 * herd — learn from current tabs
 * 
 * Scans open tabs and identifies uncategorized domains/patterns.
 * Suggests new categories or patterns the user can add to their config.
 * 
 * Usage:
 *   node scripts/learn.js            # Show suggestions
 *   node scripts/learn.js --apply    # Write suggestions to ~/.herd.json
 */

const { listTabs } = require('../lib/cdp');
const { loadConfig, CONFIG_PATHS } = require('../lib/config');
const { classifyAll } = require('../lib/classifier');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const config = loadConfig();

  const tabs = await listTabs(config.browsers);
  if (tabs.length === 0) {
    console.error('No tabs found. Is your browser running with --remote-debugging-port?');
    process.exit(1);
  }

  // Classify with current config
  const groups = classifyAll(tabs, config.categories, config.ungroupedCategory);
  const uncategorized = groups[config.ungroupedCategory] || [];

  if (uncategorized.length === 0) {
    console.log('🐑 All tabs are already categorized! Nothing to learn.');
    return;
  }

  // Extract domains from uncategorized tabs
  const domainCounts = {};
  for (const tab of uncategorized) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', '');
      if (!domainCounts[domain]) domainCounts[domain] = { count: 0, tabs: [] };
      domainCounts[domain].count++;
      domainCounts[domain].tabs.push(tab.title);
    } catch {
      // skip invalid URLs
    }
  }

  // Sort by frequency
  const sorted = Object.entries(domainCounts).sort((a, b) => b[1].count - a[1].count);

  console.log(`\n🐑 herd learn — ${uncategorized.length} uncategorized tab(s)\n`);
  console.log('These domains aren\'t matched by any category:\n');

  const suggestions = [];
  for (const [domain, info] of sorted) {
    console.log(`  ${domain} (${info.count} tab${info.count > 1 ? 's' : ''})`);
    for (const title of info.tabs.slice(0, 3)) {
      console.log(`    └─ ${title.substring(0, 60)}`);
    }
    if (info.tabs.length > 3) {
      console.log(`    └─ ...and ${info.tabs.length - 3} more`);
    }
    suggestions.push({ domain, count: info.count, titles: info.tabs });
  }

  console.log('\n─────────────────────────────────────────────');
  console.log('\nTo categorize these, add patterns to ~/.herd.json:');
  console.log('');
  console.log('  Option 1: Add to an existing category');
  console.log('    node scripts/add-rule.js "Incidents" "*microsofticm.com*"');
  console.log('');
  console.log('  Option 2: Create a new category');
  console.log('    node scripts/add-rule.js "My Project" "myapp.azurewebsites.net" --color blue');
  console.log('');
  console.log('  Option 3: Edit ~/.herd.json directly');
  console.log(`    ${path.join(os.homedir(), '.herd.json')}`);
  console.log('');

  if (apply) {
    // Auto-generate suggestions into config
    const configPath = path.join(os.homedir(), '.herd.json');
    let userConfig = {};
    try { userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch {}
    if (!userConfig.categories) userConfig.categories = { ...config.categories };

    // Add suggested patterns for domains with 2+ tabs
    for (const [domain, info] of sorted.filter(([, i]) => i.count >= 2)) {
      const suggestedName = suggestCategoryName(domain, info.titles);
      if (!userConfig.categories[suggestedName]) {
        userConfig.categories[suggestedName] = {
          patterns: [`*${domain}*`],
          color: 'grey',
        };
        console.log(`  ✓ Added category "${suggestedName}" with pattern "*${domain}*"`);
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(userConfig, null, 2));
    console.log(`\n✅ Updated ${configPath}`);
    console.log('   Review and rename categories as needed.');
  }
}

function suggestCategoryName(domain, titles) {
  // Try to extract a meaningful name from the domain
  const parts = domain.split('.');
  if (parts.length >= 2) {
    const name = parts[parts.length - 2]; // e.g., "figma" from "figma.com"
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return domain;
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
