/**
 * Minimal static server for dist/ that behaves like the production hosting
 * rules documented in README.md ("SEO & prerendering"):
 *
 *   1. an existing file            → that file
 *   2. <path>/index.html exists    → it (prerendered public page, no redirect)
 *   3. /api/*                      → 404 JSON (no backend in these checks)
 *   4. anything else               → app.html (SPA shell, noindex)
 *
 * Used by scripts/perf-public.mjs; no dependencies.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

export function startStaticServer(distDir, port = 0) {
  const resolveFile = (urlPath) => {
    const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
    const candidates = [path.join(distDir, clean), path.join(distDir, clean, 'index.html')];
    for (const file of candidates) {
      if (file.startsWith(distDir) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    return null;
  };

  const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://x').pathname;
    if (urlPath.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"no backend in static checks"}');
      return;
    }
    const file = resolveFile(urlPath) ?? path.join(distDir, 'app.html');
    const ext = path.extname(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ origin: `http://127.0.0.1:${actual}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
