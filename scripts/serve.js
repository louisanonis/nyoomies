// Zero-dependency static file server for local play: `npm start`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath rather than import.meta.dirname, which needs Node 20.11+.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  let path;
  try {
    const url = new URL(req.url, 'http://localhost');
    path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  } catch {
    res.writeHead(400).end('Bad request'); // malformed URL; don't crash the server
    return;
  }
  const file = join(root, path || 'index.html');
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => {
  console.log(`Hull Bracers running at http://localhost:${port}`);
});
