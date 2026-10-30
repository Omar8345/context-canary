import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRegression } from './engine.js';
import { tests } from './fixtures.js';
import { loadEnv } from './env.js';
import { runConnectedRegression } from './runner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await loadEnv(root);

// Import after .env loading so the adapter sees the project's credentials.
const appwrite = await import('./appwrite.js');
const port = Number(process.env.PORT || 4173);
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

function json(res, status, body) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sameOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    return new URL(req.headers.origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/status' && req.method === 'GET') return json(res, 200, { mode: appwrite.configured ? 'appwrite-ready' : 'fixture', tests: tests.length });
    if (url.pathname === '/api/tests' && req.method === 'GET') return json(res, 200, { tests: appwrite.configured ? await appwrite.loadTests() : tests });
    if (url.pathname === '/api/runs' && req.method === 'GET') {
      if (!appwrite.configured) return json(res, 200, { runs: [] });
      return json(res, 200, { runs: await appwrite.listRuns() });
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin writes are not allowed.' });
      const run = appwrite.configured
        ? await runConnectedRegression(appwrite)
        : runRegression();
      return json(res, 200, run);
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.js', 'style.css'].includes(name)) return json(res, 404, { error: 'Not found' });
    const mime = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
    const content = await fs.readFile(path.join(root, 'public', name));
    res.writeHead(200, { ...securityHeaders, 'Content-Type': `${mime}; charset=utf-8` });
    res.end(content);
  } catch (error) {
    const status = error.name === 'AppwriteError' ? 503 : 500;
    json(res, status, { error: status === 503 ? error.message : 'The analysis could not be completed.' });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Context Canary running at http://localhost:${port}`));
