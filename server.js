'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Load the static files once at startup. Requests are matched against this
// fixed map, so a request path is never used to build a filesystem path.
const assets = new Map();
for (const name of fs.readdirSync(PUBLIC_DIR)) {
  const type = CONTENT_TYPES[path.extname(name)];
  if (!type) continue;
  assets.set('/' + name, { type, body: fs.readFileSync(path.join(PUBLIC_DIR, name)) });
}
assets.set('/', assets.get('/index.html'));

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function send(res, status, type, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type }, SECURITY_HEADERS, extra));
  res.end(body);
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if (pathname === '/health') {
    return send(res, 200, 'application/json', '{"status":"ok"}', { 'Cache-Control': 'no-store' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  const asset = assets.get(pathname);
  if (!asset) {
    return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  }
  send(res, 200, asset.type, req.method === 'HEAD' ? undefined : asset.body, {
    'Cache-Control': 'no-cache',
  });
});

server.listen(PORT, HOST, () => {
  console.log(`travel-planner listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
