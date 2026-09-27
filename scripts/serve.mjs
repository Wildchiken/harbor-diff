import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.HARBORDIFF_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('HARBORDIFF_PORT must be 1–65535.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.har': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    if (relative.split('/').some(part => part.startsWith('.')) || !/^(index\.html|styles\.css|src\/[^/]+\.js|assets\/[^/]+\.(svg|png)|examples\/[^/]+\.har)$/.test(relative)) {
      res.writeHead(404); return res.end('Not found');
    }
    const target = resolve(root, relative);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep) || !(await stat(target)).isFile()) { res.writeHead(404); return res.end('Not found'); }
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': `${types[extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => process.stdout.write(`HarborDiff: http://127.0.0.1:${port}\n`));
