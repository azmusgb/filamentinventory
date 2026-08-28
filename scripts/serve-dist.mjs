import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.FI_E2E_ROOT || 'dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const mime = new Map([
  ['.html','text/html; charset=utf-8'],
  ['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],
  ['.webmanifest','application/manifest+json; charset=utf-8'],
  ['.svg','image/svg+xml'],
  ['.png','image/png'],
  ['.webp','image/webp'],
  ['.ico','image/x-icon'],
]);

if (!existsSync(join(root,'index.html'))) {
  throw new Error(`Production build not found at ${root}. Run npm run build first.`);
}

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, '');
  const clean = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(root, clean || 'index.html');
}

function sendFile(res, filePath) {
  const type = mime.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req,res) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, {'Content-Type':'application/json; charset=utf-8'});
    res.end('{"error":"browser-test-static-server"}');
    return;
  }

  const requested = safePath(url.pathname);
  if (requested.startsWith(root) && existsSync(requested) && statSync(requested).isFile()) {
    sendFile(res, requested);
    return;
  }

  if (!extname(url.pathname) || req.headers.accept?.includes('text/html')) {
    sendFile(res, join(root,'index.html'));
    return;
  }

  res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
  res.end('Not found');
});

server.listen(port,host,() => {
  console.log(`Filament Inventory browser-test server: http://${host}:${port}`);
});

for (const signal of ['SIGINT','SIGTERM']) {
  process.on(signal,() => server.close(() => process.exit(0)));
}
