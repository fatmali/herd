const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const SERVICE_PATH = path.join(__dirname, '..', 'service', 'index.js');
const TOKEN_PATH = path.join(os.homedir(), '.herd-token');
const PORT = 9922;

let serviceProcess;
let authToken;

function startService() {
  return new Promise((resolve, reject) => {
    serviceProcess = spawn('node', [SERVICE_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    serviceProcess.stderr.on('data', (data) => {
      if (data.toString().includes('running')) {
        // Read token after service creates it
        authToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
        resolve();
      }
    });
    setTimeout(() => {
      try { authToken = fs.readFileSync(TOKEN_PATH, 'utf8').trim(); } catch {}
      resolve();
    }, 3000);
  });
}

function stopService() {
  if (serviceProcess) serviceProcess.kill();
}

function request(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Herd-Token': authToken || '',
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('service HTTP API', () => {
  beforeAll(async () => {
    await startService();
  }, 10000);

  afterAll(() => {
    stopService();
  });

  test('GET /health returns ok (no auth needed)', async () => {
    const res = await request('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('0.1.0');
  });

  test('Unauthorized request returns 401', async () => {
    // Make a request without the token
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port: PORT, path: '/status', method: 'GET',
        headers: { 'Content-Type': 'application/json' }, // no X-Herd-Token
      }, (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => resolve({ status: r.statusCode, body: data ? JSON.parse(data) : null }));
      });
      req.on('error', reject);
      req.end();
    });
    expect(res.status).toBe(401);
  });

  test('GET /status returns extension state', async () => {
    const res = await request('GET', '/status');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body).toHaveProperty('lastRun');
    expect(res.body).toHaveProperty('schedule');
    expect(res.body).toHaveProperty('focusTopics');
  });

  test('GET /tabs returns tab list (empty when no extension)', async () => {
    const res = await request('GET', '/tabs');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
  });

  test('POST /organize queues command', async () => {
    const res = await request('POST', '/organize', { focus_topics: ['auth'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST /focus sets focus topics', async () => {
    const res = await request('POST', '/focus', { topics: ['sprint', 'auth'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /status reflects updated focus topics', async () => {
    await request('POST', '/focus', { topics: ['my-project'] });
    // Wait for state to update
    await new Promise(r => setTimeout(r, 100));
    const res = await request('GET', '/status');
    expect(res.body.focusTopics).toContain('my-project');
  });

  test('GET /ext/commands returns pending commands', async () => {
    // First post an organize to queue a command
    await request('POST', '/organize', {});
    const res = await request('GET', '/ext/commands');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].action).toBe('organize');
  });

  test('GET /ext/commands returns 204 when no pending commands', async () => {
    // Drain any pending
    await request('GET', '/ext/commands');
    const res = await request('GET', '/ext/commands');
    expect(res.status).toBe(204);
  });

  test('GET /nonexistent returns 404', async () => {
    const res = await request('GET', '/nonexistent');
    expect(res.status).toBe(404);
  });
});
