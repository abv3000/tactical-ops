import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
const root = resolve(import.meta.dirname, '../dist');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Сначала выполните npm run build.');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.wav':'audio/wav', '.gz':'application/gzip', '.svg':'image/svg+xml', '.css':'text/css' };
const port = Number(process.env.PORT || 4173);
const server = createServer((req, res) => {
  let file;
  try { file = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (file === root) file = resolve(root, 'index.html');
  if (!file.startsWith(root + sep) || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Tactical Ops: ${url}\nОстановить: Ctrl+C`);
  if (process.env.NO_OPEN !== '1') {
    const app = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    const child = spawn(app, [url], { stdio: 'ignore' });
    child.on('error', () => {});
  }
});
