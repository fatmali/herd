#!/usr/bin/env node
/**
 * herd - Native Messaging Bridge
 *
 * This script is spawned by the browser extension via Native Messaging.
 * It runs an HTTP server on localhost:9922 that AI agents can call,
 * and communicates with the extension over stdio (native messaging protocol).
 *
 * Protocol:
 *   Browser → Bridge: 4-byte length prefix + JSON message (native messaging standard)
 *   Bridge → Browser: 4-byte length prefix + JSON message
 *   AI Agent → Bridge: HTTP requests to localhost:9922 (token-authenticated)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const SERVICE_PORT = 9922;
const HERD_DIR = path.join(require('os').homedir(), '.herd');
const AUTH_FILE = path.join(HERD_DIR, 'auth.json');

// ─── Auth ────────────────────────────────────────────────────────────────────

let AUTH_TOKEN = null;

function loadAuthToken() {
  try {
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    AUTH_TOKEN = data.token;
  } catch (err) {
    logError('Failed to load auth token:', err.message);
    process.exit(1);
  }
}

function validateToken(req) {
  const header = req.headers['authorization'];
  if (!header) return false;
  const token = header.replace('Bearer ', '');
  return token === AUTH_TOKEN;
}

// ─── Native Messaging (stdio) ────────────────────────────────────────────────

function sendToExtension(message) {
  const json = JSON.stringify(message);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

let stdinBuffer = Buffer.alloc(0);

process.stdin.on('data', (chunk) => {
  stdinBuffer = Buffer.concat([stdinBuffer, chunk]);

  while (stdinBuffer.length >= 4) {
    const msgLength = stdinBuffer.readUInt32LE(0);
    if (stdinBuffer.length < 4 + msgLength) break;

    const msgJson = stdinBuffer.slice(4, 4 + msgLength).toString('utf8');
    stdinBuffer = stdinBuffer.slice(4 + msgLength);

    try {
      const msg = JSON.parse(msgJson);
      handleExtensionMessage(msg);
    } catch (err) {
      logError('Invalid message from extension:', err.message);
    }
  }
});

// ─── Extension State ─────────────────────────────────────────────────────────

let extensionState = {
  tabs: [],
  rules: {},
  enabled: true,
  lastRun: null,
  focusTopics: [],
  schedule: 60,
  connected: true,
};

let pendingRequests = new Map(); // id → { resolve, timeout }
let requestId = 0;

function handleExtensionMessage(msg) {
  // Extension sends state updates
  if (msg.type === 'state-update') {
    extensionState = { ...extensionState, ...msg.data };
    return;
  }

  // Extension responds to a command
  if (msg.type === 'response' && msg.id) {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(msg.data);
      pendingRequests.delete(msg.id);
    }
    return;
  }
}

function sendCommand(action, params = {}) {
  return new Promise((resolve) => {
    const id = ++requestId;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      resolve({ success: true, note: 'Extension did not respond in time (command may still execute)' });
    }, 5000);

    pendingRequests.set(id, { resolve, timeout });
    sendToExtension({ type: 'command', id, action, ...params });
  });
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health endpoint (no auth required)
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '0.1.0' }));
    return;
  }

  // All other endpoints require auth
  if (!validateToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized. Include Authorization: Bearer <token> header.' }));
    return;
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => handleRequest(req, res, body));
});

async function handleRequest(req, res, body) {
  const url = req.url.split('?')[0];

  try {
    let result;

    switch (`${req.method} ${url}`) {
      case 'GET /tabs':
        result = { tabs: extensionState.tabs };
        break;

      case 'GET /status':
        result = {
          enabled: extensionState.enabled,
          lastRun: extensionState.lastRun,
          schedule: extensionState.schedule,
          focusTopics: extensionState.focusTopics,
          tabCount: extensionState.tabs.length,
          connected: extensionState.connected,
        };
        break;

      case 'GET /rules':
        result = { rules: extensionState.rules };
        break;

      case 'POST /organize': {
        const params = body ? JSON.parse(body) : {};
        result = await sendCommand('organize', {
          focusTopics: params.focus_topics || params.focusTopics,
          collapseInactive: params.collapse_inactive !== false,
        });
        break;
      }

      case 'POST /focus': {
        const params = body ? JSON.parse(body) : {};
        result = await sendCommand('set-focus', { topics: params.topics });
        break;
      }

      case 'POST /rules/add': {
        const params = JSON.parse(body);
        if (!params.category || !params.pattern) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'category and pattern are required' }));
          return;
        }
        result = await sendCommand('add-rule', params);
        break;
      }

      case 'POST /rules/remove': {
        const params = JSON.parse(body);
        if (!params.category) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'category is required' }));
          return;
        }
        result = await sendCommand('remove-rule', params);
        break;
      }

      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ─── Logging (to file, since stdout is for native messaging) ─────────────────

function logError(...args) {
  const logFile = path.join(HERD_DIR, 'bridge.log');
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
}

// ─── Start ───────────────────────────────────────────────────────────────────

loadAuthToken();

server.listen(SERVICE_PORT, '127.0.0.1', () => {
  logError(`Bridge started on :${SERVICE_PORT}`);
  // Notify extension that bridge is ready
  sendToExtension({ type: 'bridge-ready', port: SERVICE_PORT });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logError(`Port ${SERVICE_PORT} in use. Another bridge running?`);
    // Exit cleanly — the other instance is handling HTTP
    process.exit(0);
  } else {
    logError('Server error:', err.message);
  }
});

// Keep process alive
process.stdin.resume();
process.on('disconnect', () => process.exit(0));
