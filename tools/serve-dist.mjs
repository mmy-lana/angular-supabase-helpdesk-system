import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

/**
 * Static server for a built Angular application.
 *
 * Angular serves routes client side, so any request that is not a file on disk
 * falls back to `index.html` instead of answering 404. That is what makes a
 * direct load of `/workspace` work in a plain static deployment.
 */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

export async function startStaticServer(rootDirectory, port = 0) {
  const root = normalize(rootDirectory);

  const server = createServer(async (request, response) => {
    const requestedPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const candidate = normalize(join(root, requestedPath));

    if (!candidate.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    let filePath = candidate;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {
      filePath = join(root, 'index.html');
    }

    try {
      const body = await readFile(filePath);
      response.writeHead(200, {
        'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

if (process.argv[1] && process.argv[1].endsWith('serve-dist.mjs')) {
  const target = process.argv[2] ?? 'dist/angular-supabase-helpdesk-system/browser';
  const port = Number(process.argv[3] ?? 4200);
  const { origin } = await startStaticServer(target, port);
  console.log(`Serving ${target} on ${origin}`);
}