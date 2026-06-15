#!/usr/bin/env node
/**
 * herd - add a classification rule
 *
 * Quickly add a URL pattern to a category in ~/.herd.json.
 * Creates the config file if it doesn't exist.
 *
 * Usage:
 *   node scripts/add-rule.js "Category Name" "pattern"
 *   node scripts/add-rule.js "Category Name" "pattern" --color blue
 *   node scripts/add-rule.js --list
 *   node scripts/add-rule.js --remove "Category Name"
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig } = require('../lib/config');

const CONFIG_PATH = path.join(os.homedir(), '.herd.json');
const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

function loadUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    // Start from example config defaults
    const config = loadConfig();
    return { categories: config.categories };
  }
}

function saveUserConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function listCategories(config) {
  console.log('\n🐑 Current categories:\n');
  for (const [name, cat] of Object.entries(config.categories || {})) {
    const patterns = (cat.patterns || []).join(', ');
    console.log(`  [${cat.color || 'grey'}] ${name}`);
    console.log(`      Patterns: ${patterns}`);
  }
  console.log(`\nConfig file: ${CONFIG_PATH}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list') || args.includes('-l')) {
    const config = loadUserConfig();
    listCategories(config);
    return;
  }

  if (args.includes('--remove')) {
    const idx = args.indexOf('--remove');
    const categoryName = args[idx + 1];
    if (!categoryName) {
      console.error('Usage: node scripts/add-rule.js --remove "Category Name"');
      process.exit(1);
    }
    const config = loadUserConfig();
    if (config.categories && config.categories[categoryName]) {
      delete config.categories[categoryName];
      saveUserConfig(config);
      console.log(`✅ Removed category "${categoryName}"`);
    } else {
      console.error(`Category "${categoryName}" not found.`);
      process.exit(1);
    }
    return;
  }

  if (args.length < 2) {
    console.log(`
🐑 herd add-rule — add a tab classification rule

Usage:
  node scripts/add-rule.js "Category Name" "url-pattern"
  node scripts/add-rule.js "Category Name" "url-pattern" --color blue

Pattern syntax:
  *          matches any characters (including path separators)
  literal    matches exactly

Examples:
  "github.com/*/pull/"     → matches GitHub pull requests
  "*figma.com*"            → matches any Figma URL
  "*microsofticm.com*"     → matches ICM incidents
  "localhost:3000*"        → matches local dev server on port 3000

Options:
  --color <color>    Tab group color (${VALID_COLORS.join(', ')})
  --list             Show all current categories
  --remove "Name"    Remove a category

Config file: ${CONFIG_PATH}
`);
    return;
  }

  const categoryName = args[0];
  const pattern = args[1];
  const colorIdx = args.indexOf('--color');
  const color = colorIdx !== -1 ? args[colorIdx + 1] : null;

  if (color && !VALID_COLORS.includes(color)) {
    console.error(`Invalid color "${color}". Valid: ${VALID_COLORS.join(', ')}`);
    process.exit(1);
  }

  const config = loadUserConfig();
  if (!config.categories) config.categories = {};

  if (config.categories[categoryName]) {
    // Add pattern to existing category
    if (!config.categories[categoryName].patterns.includes(pattern)) {
      config.categories[categoryName].patterns.push(pattern);
      if (color) config.categories[categoryName].color = color;
      saveUserConfig(config);
      console.log(`✅ Added pattern "${pattern}" to category "${categoryName}"`);
    } else {
      console.log(`Pattern "${pattern}" already exists in "${categoryName}"`);
    }
  } else {
    // Create new category
    config.categories[categoryName] = {
      patterns: [pattern],
      color: color || 'grey',
    };
    saveUserConfig(config);
    console.log(`✅ Created category "${categoryName}" with pattern "${pattern}" [${color || 'grey'}]`);
  }

  console.log(`\nTest with: node scripts/organize.js --dry-run --no-context`);
}

main();
