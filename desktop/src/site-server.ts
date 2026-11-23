import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export type SiteServer = {
  readonly port: number;
  readonly origin: string;
  close(): Promise<void>;
};

/** Resolve a URL path against `root`. Returns null when the path would leave the site. */
export function fileFor(root: string, urlPath: string): string | null {
  const base = path.resolve(root);
  let rel = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  if (!rel.startsWith('/')) rel = `/${rel}`;
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === '') rel = '/index.html';
  const file = path.resolve(base, `.${rel}`);
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (file !== base && !file.startsWith(prefix)) return null;
  if (file === base) return path.join(base, 'index.html');
  return file;
}

export function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function createSiteServer(root: string): Promise<SiteServer> {
  const base = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const file = fileFor(base, req.url ?? '/');
      if (!file) {
        res.writeHead(403).end('forbidden');
        return;
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, {
          'content-type': contentType(file),
          'cache-control': 'no-store',
        });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('site server bound without a port'));
        return;
      }
      resolve({
        port: addr.port,
        origin: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((e) => (e ? fail(e) : done()));
          }),
      });
    });
  });
}
