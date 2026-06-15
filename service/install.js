#!/usr/bin/env node
/**
 * herd-tabs CLI
 *
 * Usage:
 *   npx herd-tabs --install    Install native messaging host + auth token
 *   npx herd-tabs --uninstall  Remove native messaging host + cleanup
 *   npx herd-tabs --status     Check if everything is configured
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const HERD_DIR = path.join(require('os').homedir(), '.herd');
const AUTH_FILE = path.join(HERD_DIR, 'auth.json');
const HOST_NAME = 'com.herd.bridge';
const MANIFEST_FILE = path.join(HERD_DIR, `${HOST_NAME}.json`);

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (command === '--install') {
  install();
} else if (command === '--uninstall') {
  uninstall();
} else if (command === '--status') {
  status();
} else {
  console.log(`
🐑 herd-tabs — Tab organizer AI bridge

Commands:
  --install     Set up native messaging host (one-time)
  --uninstall   Remove native messaging host
  --status      Check configuration status
`);
}

// ─── Install ─────────────────────────────────────────────────────────────────

function install() {
  console.log('🐑 Installing Herd AI bridge...\n');

  // 1. Create ~/.herd directory
  if (!fs.existsSync(HERD_DIR)) {
    fs.mkdirSync(HERD_DIR, { mode: 0o700 });
    console.log(`  ✓ Created ${HERD_DIR}`);
  } else {
    console.log(`  ✓ Directory exists: ${HERD_DIR}`);
  }

  // 2. Generate auth token
  let token;
  if (fs.existsSync(AUTH_FILE)) {
    const existing = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    token = existing.token;
    console.log('  ✓ Auth token already exists');
  } else {
    token = crypto.randomBytes(32).toString('hex');
    const authData = {
      token,
      created: new Date().toISOString(),
      note: 'Used by Herd extension and bridge to authenticate local API requests',
    };
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2), { mode: 0o600 });
    console.log('  ✓ Generated auth token');
  }

  // 3. Write bridge script
  const bridgeSrc = path.join(__dirname, 'bridge-native.js');
  const bridgeDst = path.join(HERD_DIR, 'bridge-native.js');
  fs.copyFileSync(bridgeSrc, bridgeDst);
  console.log('  ✓ Installed bridge script');

  // 4. Write platform launcher
  if (isWindows) {
    const batContent = `@echo off\r\nnode "${bridgeDst}" %*\r\n`;
    const batPath = path.join(HERD_DIR, 'bridge.bat');
    fs.writeFileSync(batPath, batContent);
    console.log('  ✓ Created bridge.bat launcher');
  } else {
    const shContent = `#!/bin/sh\nexec node "${bridgeDst}" "$@"\n`;
    const shPath = path.join(HERD_DIR, 'bridge.sh');
    fs.writeFileSync(shPath, shContent, { mode: 0o755 });
    console.log('  ✓ Created bridge.sh launcher');
  }

  // 5. Write native messaging manifest
  const hostPath = isWindows
    ? path.join(HERD_DIR, 'bridge.bat')
    : path.join(HERD_DIR, 'bridge.sh');

  const manifest = {
    name: HOST_NAME,
    description: 'Herd tab organizer - AI bridge',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [],
  };

  // We'll add the extension ID later when the user provides it,
  // or use a wildcard during development
  // For now, allow all chrome-extension origins (dev mode)
  // In production, this gets locked to the published extension ID
  manifest.allowed_origins = [
    'chrome-extension://*/', // Dev mode - accepts any extension
  ];

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  console.log('  ✓ Created native messaging manifest');

  // 6. Register with browser
  if (isWindows) {
    registerWindows();
  } else if (isMac) {
    registerMac();
  } else {
    registerLinux();
  }

  // 7. Copy skill file to known agent directories
  copySkillFile();

  // 8. Verify
  console.log('\n✅ Herd AI bridge installed successfully!\n');
  console.log('Next steps:');
  console.log('  1. Restart your browser (Edge/Chrome)');
  console.log('  2. Say "organize my tabs" to your AI agent\n');
}

// ─── Platform Registration ───────────────────────────────────────────────────

function registerWindows() {
  // Register for both Edge and Chrome
  const regPaths = [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
  ];

  for (const regPath of regPaths) {
    try {
      execSync(`reg add "${regPath}" /ve /t REG_SZ /d "${MANIFEST_FILE}" /f`, {
        stdio: 'pipe',
      });
    } catch (err) {
      // Non-fatal — browser might not be installed
    }
  }
  console.log('  ✓ Registered with Edge and Chrome (Windows Registry)');
}

function registerMac() {
  // macOS: copy manifest to ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
  const dirs = [
    path.join(require('os').homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
    path.join(require('os').homedir(), 'Library/Application Support/Microsoft Edge/NativeMessagingHosts'),
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(MANIFEST_FILE, path.join(dir, `${HOST_NAME}.json`));
    } catch (err) {
      // Non-fatal
    }
  }
  console.log('  ✓ Registered with Edge and Chrome (macOS)');
}

function registerLinux() {
  // Linux: ~/.config/google-chrome/NativeMessagingHosts/
  const dirs = [
    path.join(require('os').homedir(), '.config/google-chrome/NativeMessagingHosts'),
    path.join(require('os').homedir(), '.config/microsoft-edge/NativeMessagingHosts'),
  ];

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(MANIFEST_FILE, path.join(dir, `${HOST_NAME}.json`));
    } catch (err) {
      // Non-fatal
    }
  }
  console.log('  ✓ Registered with Edge and Chrome (Linux)');
}

// ─── Skill File Distribution ─────────────────────────────────────────────────

function copySkillFile() {
  const skillSrc = path.join(__dirname, '..', 'shared', 'skill.md');
  if (!fs.existsSync(skillSrc)) {
    console.log('  ⚠ Skill file not found (skipping)');
    return;
  }

  const home = require('os').homedir();
  const targets = [
    { dir: path.join(home, '.copilot', 'skills'), name: 'GitHub Copilot CLI' },
    { dir: path.join(home, '.claude', 'skills'), name: 'Claude Code' },
  ];

  let copied = 0;
  for (const target of targets) {
    // Only copy if the agent's skills directory already exists
    // (meaning the user actually uses that agent)
    if (fs.existsSync(target.dir)) {
      const dst = path.join(target.dir, 'herd.md');
      fs.copyFileSync(skillSrc, dst);
      console.log(`  ✓ Skill file → ${target.name} (${dst})`);
      copied++;
    }
  }

  // Always copy to ~/.herd/ as a reference
  const refDst = path.join(HERD_DIR, 'skill.md');
  fs.copyFileSync(skillSrc, refDst);

  if (copied === 0) {
    console.log(`  ✓ Skill file saved to ${refDst}`);
    console.log('    (Copy to your agent\'s skills folder to enable AI control)');
  }
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

function uninstall() {
  console.log('🐑 Removing Herd AI bridge...\n');

  if (isWindows) {
    const regPaths = [
      `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
      `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
    ];
    for (const regPath of regPaths) {
      try { execSync(`reg delete "${regPath}" /f`, { stdio: 'pipe' }); } catch {}
    }
    console.log('  ✓ Removed registry entries');
  } else if (isMac) {
    const dirs = [
      path.join(require('os').homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
      path.join(require('os').homedir(), 'Library/Application Support/Microsoft Edge/NativeMessagingHosts'),
    ];
    for (const dir of dirs) {
      try { fs.unlinkSync(path.join(dir, `${HOST_NAME}.json`)); } catch {}
    }
    console.log('  ✓ Removed manifest files');
  } else {
    const dirs = [
      path.join(require('os').homedir(), '.config/google-chrome/NativeMessagingHosts'),
      path.join(require('os').homedir(), '.config/microsoft-edge/NativeMessagingHosts'),
    ];
    for (const dir of dirs) {
      try { fs.unlinkSync(path.join(dir, `${HOST_NAME}.json`)); } catch {}
    }
    console.log('  ✓ Removed manifest files');
  }

  // Remove ~/.herd directory
  if (fs.existsSync(HERD_DIR)) {
    fs.rmSync(HERD_DIR, { recursive: true });
    console.log(`  ✓ Removed ${HERD_DIR}`);
  }

  console.log('\n✅ Herd AI bridge uninstalled.\n');
}

// ─── Status ──────────────────────────────────────────────────────────────────

function status() {
  console.log('🐑 Herd AI bridge status:\n');

  const checks = [];

  // Check ~/.herd exists
  checks.push({
    name: 'Directory (~/.herd)',
    ok: fs.existsSync(HERD_DIR),
  });

  // Check auth token
  checks.push({
    name: 'Auth token',
    ok: fs.existsSync(AUTH_FILE),
  });

  // Check manifest
  checks.push({
    name: 'Native messaging manifest',
    ok: fs.existsSync(MANIFEST_FILE),
  });

  // Check bridge script
  checks.push({
    name: 'Bridge script',
    ok: fs.existsSync(path.join(HERD_DIR, 'bridge-native.js')),
  });

  // Check registry (Windows only)
  if (isWindows) {
    let regOk = false;
    try {
      execSync(`reg query "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}" /ve`, { stdio: 'pipe' });
      regOk = true;
    } catch {}
    checks.push({ name: 'Registry (Edge)', ok: regOk });
  }

  for (const check of checks) {
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.name}`);
  }

  const allOk = checks.every(c => c.ok);
  console.log(`\n${allOk ? '✅ Everything looks good!' : '⚠️  Some checks failed. Run --install to fix.'}\n`);
}
