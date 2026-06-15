#!/usr/bin/env node
/**
 * herd - MCP server
 *
 * Model Context Protocol server that exposes tab organization tools
 * to AI agents (Copilot CLI, Claude Code, etc.)
 *
 * Protocol: JSON-RPC over stdio (MCP standard)
 *
 * Tools exposed:
 *   herd_list_tabs    - List all open tabs with current classification
 *   herd_organize     - Organize tabs into groups
 *   herd_set_focus    - Set focus topics for context-aware grouping
 *   herd_add_rule     - Add a classification rule
 *   herd_remove_rule  - Remove a rule or pattern
 *   herd_get_rules    - Get current rules
 *   herd_status       - Get extension status
 */

const http = require('http');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVICE_PORT = 9922;
const TOKEN_PATH = path.join(os.homedir(), '.herd-token');

// ─── Auth Token ──────────────────────────────────────────────────────────────

function loadOrCreateToken() {
  try {
    const existing = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {}
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  return token;
}

const AUTH_TOKEN = loadOrCreateToken();

// ─── MCP Protocol Implementation ─────────────────────────────────────────────

const TOOLS = [
  {
    name: 'herd_list_tabs',
    description: 'List all open browser tabs with their current category classification. Returns tab title, URL, and assigned category.',
    inputSchema: {
      type: 'object',
      properties: {
        window: {
          type: 'string',
          description: 'Filter by window: "current", "all" (default: "all")',
        },
      },
    },
  },
  {
    name: 'herd_organize',
    description: 'Organize all browser tabs into groups based on classification rules and focus topics. Tabs are grouped within their current window.',
    inputSchema: {
      type: 'object',
      properties: {
        focus_topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional focus topics. Tabs matching these get highlighted as "Current Focus" group.',
        },
        collapse_inactive: {
          type: 'boolean',
          description: 'Collapse groups not matching focus (default: true)',
        },
      },
    },
  },
  {
    name: 'herd_set_focus',
    description: 'Set focus topics for context-aware tab grouping. Tabs matching any topic (in title or URL) will be grouped as "Current Focus".',
    inputSchema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Focus topics (keywords or phrases). Example: ["auth migration", "sprint-review"]',
        },
      },
      required: ['topics'],
    },
  },
  {
    name: 'herd_add_rule',
    description: 'Add a URL pattern to a tab category. Creates the category if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name (e.g. "Code Review", "My Project")',
        },
        pattern: {
          type: 'string',
          description: 'URL pattern using * as wildcard (e.g. "*github.com/myorg*", "localhost:3000*")',
        },
        color: {
          type: 'string',
          enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'],
          description: 'Tab group color (default: grey)',
        },
      },
      required: ['category', 'pattern'],
    },
  },
  {
    name: 'herd_remove_rule',
    description: 'Remove a pattern from a category, or remove an entire category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name to modify or remove',
        },
        pattern: {
          type: 'string',
          description: 'Specific pattern to remove. If omitted, removes the entire category.',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'herd_get_rules',
    description: 'Get all current tab classification rules (categories, patterns, and colors).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'herd_status',
    description: 'Get herd extension status: enabled, last run time, schedule, and current focus topics.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── HTTP Bridge to Extension ─────────────────────────────────────────────────

let extensionState = {
  tabs: [],
  rules: require('../shared/default-rules'),
  enabled: true,
  lastRun: null,
  focusTopics: [],
  schedule: 60,
};

// Simple HTTP server that the extension polls / receives commands from
const httpServer = http.createServer((req, res) => {
  // No CORS headers — only same-machine clients (extension service worker, CLI) should call this.
  // Extension service workers are not subject to same-origin policy.

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check: require token on all endpoints except /health
  const url = new URL(req.url, `http://localhost:${SERVICE_PORT}`);
  if (url.pathname !== '/health') {
    const provided = req.headers['x-herd-token'] || url.searchParams.get('token');
    if (provided !== AUTH_TOKEN) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      await handleHttp(req, res, body);
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

async function handleHttp(req, res, body) {
  const url = new URL(req.url, `http://localhost:${SERVICE_PORT}`);

  // Extension reports its state
  if (req.method === 'POST' && url.pathname === '/ext/state') {
    extensionState = { ...extensionState, ...JSON.parse(body) };
    res.writeHead(200);
    res.end('ok');
    return;
  }

  // Extension polls for pending commands
  if (req.method === 'GET' && url.pathname === '/ext/commands') {
    if (pendingCommands.length > 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pendingCommands.splice(0)));
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  // External clients (non-MCP) can also call these endpoints
  if (req.method === 'GET' && url.pathname === '/tabs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(extensionState.tabs));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/organize') {
    const params = body ? JSON.parse(body) : {};
    const result = await executeTool('herd_organize', params);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/focus') {
    const params = body ? JSON.parse(body) : {};
    const result = await executeTool('herd_set_focus', params);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: extensionState.enabled,
      lastRun: extensionState.lastRun,
      schedule: extensionState.schedule,
      focusTopics: extensionState.focusTopics,
      tabCount: extensionState.tabs.length,
    }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', version: '0.1.0', tokenPath: TOKEN_PATH }));
    return;
  }

  res.writeHead(404);
  res.end('not found');
}

// Commands queued for the extension to pick up
let pendingCommands = [];

function queueCommand(command) {
  pendingCommands.push(command);
  return new Promise((resolve) => {
    // If extension picks up command within 2s, great. Otherwise resolve anyway.
    const timeout = setTimeout(() => resolve({ success: true, note: 'command queued (extension will process on next poll)' }), 2000);
    const check = setInterval(() => {
      if (pendingCommands.length === 0) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve({ success: true });
      }
    }, 100);
  });
}

// ─── Tool Execution ──────────────────────────────────────────────────────────

async function executeTool(name, params) {
  switch (name) {
    case 'herd_list_tabs':
      // Queue a state request so extension reports its tabs
      await queueCommand({ action: 'request-state' });
      return { tabs: extensionState.tabs };

    case 'herd_organize':
      if (params.focus_topics) {
        extensionState.focusTopics = params.focus_topics;
      }
      await queueCommand({
        action: 'organize',
        focusTopics: params.focus_topics || extensionState.focusTopics,
        collapseInactive: params.collapse_inactive !== false,
      });
      return { success: true, message: 'Tabs organized' };

    case 'herd_set_focus':
      extensionState.focusTopics = params.topics || [];
      await queueCommand({ action: 'set-focus', topics: params.topics });
      return { success: true, topics: params.topics };

    case 'herd_add_rule': {
      const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
      if (!params.category || typeof params.category !== 'string' || params.category.length > 100) {
        return { error: 'Invalid category name' };
      }
      if (!params.pattern || typeof params.pattern !== 'string' || params.pattern.length > 500) {
        return { error: 'Invalid pattern (max 500 chars)' };
      }
      if (params.color && !VALID_COLORS.includes(params.color)) {
        return { error: `Invalid color. Must be one of: ${VALID_COLORS.join(', ')}` };
      }
      // Block prototype pollution keys
      if (['__proto__', 'constructor', 'prototype'].includes(params.category)) {
        return { error: 'Reserved category name' };
      }
      if (Object.keys(extensionState.rules).length >= 50 && !extensionState.rules[params.category]) {
        return { error: 'Maximum 50 categories reached' };
      }
      if (!extensionState.rules[params.category]) {
        extensionState.rules[params.category] = { patterns: [], color: params.color || 'grey' };
      }
      if (!extensionState.rules[params.category].patterns.includes(params.pattern)) {
        if (extensionState.rules[params.category].patterns.length >= 100) {
          return { error: 'Maximum 100 patterns per category reached' };
        }
        extensionState.rules[params.category].patterns.push(params.pattern);
      }
      if (params.color) extensionState.rules[params.category].color = params.color;
      await queueCommand({ action: 'update-rules', rules: extensionState.rules });
      return { success: true, category: params.category, pattern: params.pattern };
    }

    case 'herd_remove_rule':
      if (params.pattern && extensionState.rules[params.category]) {
        extensionState.rules[params.category].patterns =
          extensionState.rules[params.category].patterns.filter(p => p !== params.pattern);
        if (extensionState.rules[params.category].patterns.length === 0) {
          delete extensionState.rules[params.category];
        }
      } else {
        delete extensionState.rules[params.category];
      }
      await queueCommand({ action: 'update-rules', rules: extensionState.rules });
      return { success: true };

    case 'herd_get_rules':
      return { rules: extensionState.rules };

    case 'herd_status':
      return {
        enabled: extensionState.enabled,
        lastRun: extensionState.lastRun,
        schedule: extensionState.schedule,
        focusTopics: extensionState.focusTopics,
        tabCount: extensionState.tabs.length,
      };

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── MCP Stdio Server ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin });

function sendMcpResponse(response) {
  const json = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

let initialized = false;

rl.on('line', (line) => {
  // MCP uses Content-Length framing, but for simplicity handle line-by-line JSON too
  try {
    const msg = JSON.parse(line);
    handleMcpMessage(msg);
  } catch {
    // Might be a Content-Length header line, skip
  }
});

// Also handle Content-Length framed input
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) { buffer = buffer.slice(headerEnd + 4); continue; }

    const contentLength = parseInt(match[1]);
    const contentStart = headerEnd + 4;

    if (buffer.length < contentStart + contentLength) break;

    const content = buffer.slice(contentStart, contentStart + contentLength);
    buffer = buffer.slice(contentStart + contentLength);

    try {
      const msg = JSON.parse(content);
      handleMcpMessage(msg);
    } catch {}
  }
});

function handleMcpMessage(msg) {
  if (msg.method === 'initialize') {
    initialized = true;
    sendMcpResponse({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'herd', version: '0.1.0' },
      },
    });
  } else if (msg.method === 'notifications/initialized') {
    // Client acknowledged init, nothing to respond
  } else if (msg.method === 'tools/list') {
    sendMcpResponse({
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: TOOLS },
    });
  } else if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params;
    executeTool(name, args || {}).then(result => {
      sendMcpResponse({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      });
    });
  } else if (msg.id) {
    // Unknown method with id — respond with error
    sendMcpResponse({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method}` },
    });
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

httpServer.listen(SERVICE_PORT, '127.0.0.1', () => {
  // Log to stderr (stdout is for MCP protocol)
  process.stderr.write(`herd service running: HTTP on :${SERVICE_PORT}, MCP on stdio\n`);
  process.stderr.write(`Auth token: ${TOKEN_PATH}\n`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`Port ${SERVICE_PORT} already in use. Another herd service running?\n`);
    process.exit(1);
  }
  throw err;
});
