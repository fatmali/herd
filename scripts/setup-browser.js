#!/usr/bin/env node
/**
 * herd — browser setup helper
 * Configures Edge/Chrome to launch with the CDP debugging port enabled.
 * 
 * Usage:
 *   node scripts/setup-browser.js          # Interactive setup
 *   node scripts/setup-browser.js --edge   # Setup Edge only
 *   node scripts/setup-browser.js --chrome # Setup Chrome only
 *   node scripts/setup-browser.js --help   # Show help
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const EDGE_PORT = 9222;
const CHROME_PORT = 9223;

function getShortcutPaths() {
  const desktop = path.join(os.homedir(), 'Desktop');
  const startMenu = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const taskbar = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');

  return { desktop, startMenu, taskbar };
}

function showHelp() {
  console.log(`
🐑 herd — Browser Setup

To organize tabs, herd needs to connect to your browser via CDP
(Chrome DevTools Protocol). This requires adding a flag to your browser shortcut.

OPTION 1: Modify your browser shortcut (recommended)
─────────────────────────────────────────────────────
Right-click your Edge/Chrome shortcut → Properties → Target field.
Add to the end:

  Edge:   --remote-debugging-port=${EDGE_PORT}
  Chrome: --remote-debugging-port=${CHROME_PORT}

Example (Edge):
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --remote-debugging-port=${EDGE_PORT}

OPTION 2: Create a new shortcut
────────────────────────────────
This script can create a new "Edge (herd)" shortcut on your desktop.
Run: node scripts/setup-browser.js --edge

OPTION 3: Launch from command line
──────────────────────────────────
  Edge:
    start msedge --remote-debugging-port=${EDGE_PORT}

  Chrome:
    start chrome --remote-debugging-port=${CHROME_PORT}

IMPORTANT NOTES:
  • The debug port is bound to localhost only (no remote access)
  • You must close ALL browser windows before relaunching with the flag
  • The flag only works when added to the first browser instance that starts

VERIFY IT WORKS:
  After launching with the flag, run:
    node scripts/list-tabs.js

  You should see your open tabs listed.
`);
}

function createDesktopShortcut(browser) {
  const isEdge = browser === 'edge';
  const name = isEdge ? 'Edge (herd)' : 'Chrome (herd)';
  const port = isEdge ? EDGE_PORT : CHROME_PORT;

  // Find browser executable
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  const searchPaths = isEdge ? edgePaths : chromePaths;
  const exePath = searchPaths.find(p => fs.existsSync(p));

  if (!exePath) {
    console.error(`❌ Could not find ${isEdge ? 'Edge' : 'Chrome'} installation.`);
    return false;
  }

  const desktop = path.join(os.homedir(), 'Desktop');
  const shortcutPath = path.join(desktop, `${name}.lnk`);

  // Use PowerShell to create shortcut
  const ps = `
    $ws = New-Object -ComObject WScript.Shell
    $sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')
    $sc.TargetPath = '${exePath.replace(/'/g, "''")}'
    $sc.Arguments = '--remote-debugging-port=${port}'
    $sc.Description = '${name} - with herd tab organizer support'
    $sc.Save()
  `;

  try {
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      encoding: 'utf-8',
    });
    console.log(`✅ Created shortcut: ${shortcutPath}`);
    console.log(`   Port: ${port}`);
    console.log(`\n⚠️  Close ALL ${isEdge ? 'Edge' : 'Chrome'} windows, then launch from the new shortcut.`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to create shortcut: ${err.message}`);
    return false;
  }
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
} else if (args.includes('--edge')) {
  createDesktopShortcut('edge');
} else if (args.includes('--chrome')) {
  createDesktopShortcut('chrome');
} else {
  showHelp();
  console.log('\nTo create a shortcut, run with --edge or --chrome');
}
