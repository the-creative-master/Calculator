#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for local development: `npm start`.
 *
 * Serve the site over http(s) rather than opening index.html as a file. YouTube's embedded
 * player needs a real origin as the referrer, and on file:// it shows "Error 153".
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (error) {
    return send(res, 400, 'Bad request');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.resolve(ROOT, '.' + pathname);
  const relative = path.relative(ROOT, file);
  // Stay inside the project and never serve dotfiles (.git and friends) or node_modules.
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some((part) => part.startsWith('.') || part === 'node_modules')) {
    return send(res, 404, 'Not found');
  }

  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // A dev server: never let the browser (or a proxy) keep a copy that could go stale mid-edit.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Calculator running at http://localhost:${PORT}`);
});
