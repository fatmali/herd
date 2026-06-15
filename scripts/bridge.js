#!/usr/bin/env node
/**
 * herd — local bridge server
 * 
 * A tiny HTTP server (localhost:9333) that bridges the CLI → extension.
 * The extension polls this for pending grouping plans.
 * 
 * Usage:
 *   node scripts/bridge.js          # Start in foreground
 *   node scripts/bridge.js --daemon # Start in background (detached)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9333;
const PLAN_FILE = path.join(os.homedir(), '.herd-plan.json');

let pendingPlan = null;

const server = http.createServer((req, res) => {
  // CORS for extension
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/herd-plan' && req.method === 'GET') {
    // Extension polls this for pending plans
    if (pendingPlan) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pendingPlan));
    } else {
      // Check file fallback
      try {
        if (fs.existsSync(PLAN_FILE)) {
          const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf-8'));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(plan));
          return;
        }
      } catch {}
      res.writeHead(204);
      res.end();
    }
  } else if (req.url === '/herd-ack' && req.method === 'POST') {
    // Extension acknowledges it applied the plan
    pendingPlan = null;
    try { fs.unlinkSync(PLAN_FILE); } catch {}
    res.writeHead(200);
    res.end('ok');
  } else if (req.url === '/herd-plan' && req.method === 'POST') {
    // CLI posts a new plan
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        pendingPlan = JSON.parse(body);
        fs.writeFileSync(PLAN_FILE, body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ queued: true, groups: pendingPlan.length }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', version: '0.1.0' }));
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`🐑 herd bridge running on http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('Bridge already running on port ' + PORT);
    process.exit(0);
  }
  throw err;
});
