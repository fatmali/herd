#!/usr/bin/env node
/**
 * herd — organize browser tabs by work context
 * 
 * Main entry point. Connects to browsers via CDP, classifies tabs,
 * and organizes them into tab groups based on activity type and work context.
 * 
 * Usage:
 *   node scripts/organize.js              # Organize with default config
 *   node scripts/organize.js --dry-run    # Show what would change without doing it
 *   node scripts/organize.js --no-context # Skip WorkIQ context lookup
 *   node scripts/organize.js --context "project1, project2"  # Manual focus topics
 */

const { listTabs, getTabsWithWindows } = require('../lib/cdp');
const { loadConfig } = require('../lib/config');
const { classifyAll, classifyWithContext } = require('../lib/classifier');
const { getWorkContext } = require('../lib/context');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noContext = args.includes('--no-context');
  const contextIdx = args.indexOf('--context');
  const manualContext = contextIdx !== -1 ? args[contextIdx + 1] : null;

  const config = loadConfig();

  console.log('🐑 herd — organizing your tabs...\n');

  // Step 1: Connect and list tabs (with window info for per-window grouping)
  let tabs = await listTabs(config.browsers);
  if (tabs.length === 0) {
    console.log('No tabs found. Is your browser running with --remote-debugging-port?');
    console.log('Run: node scripts/setup-browser.js');
    process.exit(1);
  }

  // Try to enrich with window IDs for per-window grouping
  for (const browser of config.browsers) {
    try {
      const enriched = await getTabsWithWindows(browser.port);
      if (enriched.length > 0) {
        // Replace tabs from this browser with enriched versions
        tabs = tabs.filter(t => t.browserPort !== browser.port).concat(
          enriched.map(t => ({ ...t, browserName: browser.name }))
        );
      }
    } catch {
      // Window info unavailable, continue without it
    }
  }

  console.log(`📋 Found ${tabs.length} open tab(s)`);

  // Step 2: Get work context
  let workContext = null;
  if (!noContext && config.useWorkContext) {
    if (manualContext) {
      workContext = {
        focusTopics: manualContext.split(',').map(t => t.trim()),
        currentMeeting: null,
        summary: manualContext,
      };
      console.log(`🎯 Manual context: ${workContext.focusTopics.join(', ')}`);
    } else {
      console.log('🔍 Fetching work context from WorkIQ...');
      workContext = await getWorkContext();
      if (workContext.error) {
        console.log(`   ⚠️  WorkIQ unavailable (${workContext.error.substring(0, 50)}), using rules only`);
        workContext = null;
      } else if (workContext.focusTopics.length > 0) {
        console.log(`   ✓ Focus topics: ${workContext.focusTopics.slice(0, 5).join(', ')}`);
      }
    }
  }

  // Step 3: Classify tabs
  let groups;
  if (workContext && workContext.focusTopics.length > 0) {
    groups = classifyWithContext(tabs, config.categories, workContext, config.ungroupedCategory);
  } else {
    groups = classifyAll(tabs, config.categories, config.ungroupedCategory);
  }

  // Step 4: Display results
  console.log('\n📂 Tab Groups:\n');
  const sortedGroups = Object.entries(groups).sort((a, b) => {
    // Current Focus always first
    if (a[0].includes('Focus')) return -1;
    if (b[0].includes('Focus')) return 1;
    return b[1].length - a[1].length;
  });

  for (const [category, categoryTabs] of sortedGroups) {
    const color = config.categories[category]?.color || 'grey';
    console.log(`  [${color}] ${category} (${categoryTabs.length} tabs)`);
    for (const tab of categoryTabs) {
      const title = (tab.title || 'Untitled').substring(0, 55);
      console.log(`       • ${title}`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('🏁 Dry run complete — no changes made.');
    return { groups, applied: false };
  }

  // Step 5: Apply tab groups via CDP
  console.log('🔧 Applying tab groups...');
  const result = await applyTabGroups(tabs, groups, config);
  
  if (result.success) {
    console.log(`\n✅ Done! Organized ${tabs.length} tabs into ${sortedGroups.length} groups.`);
  } else {
    console.log(`\n⚠️  Partial: ${result.message}`);
    console.log('   Tab Groups API requires a helper extension. See README for setup.');
    console.log('   Your tabs were classified — install the herd extension to auto-group them.');
  }

  return { groups, applied: result.success };
}

/**
 * Apply tab groups using CDP.
 * 
 * Note: Chrome's tab grouping API (chrome.tabs.group/chrome.tabGroups) is only
 * available to extensions. CDP alone can't create tab groups directly.
 * 
 * Strategy:
 * 1. If the herd helper extension is installed, send commands to it via CDP
 * 2. Otherwise, output the grouping plan for manual or extension-based application
 */
async function applyTabGroups(tabs, groups, config) {
  const CDP = require('chrome-remote-interface');

  for (const browser of config.browsers) {
    try {
      // Look for the herd helper extension's background page
      const targets = await CDP.List({ port: browser.port });
      const helperTarget = targets.find(t =>
        t.title === 'herd-helper' || (t.url && t.url.includes('herd-helper'))
      );

      if (helperTarget) {
        // Extension found! Send grouping commands
        const client = await CDP({ port: browser.port, target: helperTarget });
        try {
          await client.Runtime.enable();
          const groupingPlan = JSON.stringify(
            Object.entries(groups).map(([name, categoryTabs]) => ({
              name,
              color: config.categories[name]?.color || 'grey',
              tabUrls: categoryTabs
                .filter(t => t.browserPort === browser.port)
                .map(t => t.url),
              collapsed: config.collapseInactiveGroups && !name.includes('Focus'),
            }))
          );

          await client.Runtime.evaluate({
            expression: `window.herdOrganize(${groupingPlan})`,
            awaitPromise: true,
            returnByValue: true,
          });

          return { success: true };
        } finally {
          await client.close().catch(() => {});
        }
      }
    } catch {
      continue;
    }
  }

  // No helper extension found — output the plan as JSON for other consumers
  const planPath = require('path').join(require('os').homedir(), '.herd-plan.json');
  const plan = Object.entries(groups).map(([name, categoryTabs]) => ({
    name,
    color: config.categories[name]?.color || 'grey',
    tabs: categoryTabs.map(t => ({ title: t.title, url: t.url })),
    collapsed: config.collapseInactiveGroups && !name.includes('Focus'),
  }));
  require('fs').writeFileSync(planPath, JSON.stringify(plan, null, 2));

  return {
    success: false,
    message: `Grouping plan saved to ${planPath}. Install the herd helper extension for auto-grouping.`,
  };
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

module.exports = { main };
