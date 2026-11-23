import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { contentType, createSiteServer, fileFor, type SiteServer } from './site-server.js';

function statusOf(port: number, urlPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ hostname: '127.0.0.1', port, path: urlPath }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });
}

describe('fileFor', () => {
  const root = path.join(os.tmpdir(), 'hlm-site-root');

  it('maps / to index.html inside the root', () => {
    assert.equal(fileFor(root, '/'), path.join(path.resolve(root), 'index.html'));
  });

  it('maps a nested file', () => {
    assert.equal(fileFor(root, '/assets/app.js'), path.join(path.resolve(root), 'assets', 'app.js'));
  });

  it('rejects a path that would leave the site', () => {
    assert.equal(fileFor(root, '/../secret'), null);
    assert.equal(fileFor(root, '/foo/../../etc/passwd'), null);
  });
});

describe('contentType', () => {
  it('names wasm and javascript', () => {
    assert.equal(contentType('k.wasm'), 'application/wasm');
    assert.equal(contentType('boot.js'), 'text/javascript; charset=utf-8');
  });
});

describe('createSiteServer', () => {
  let dir = '';
  let srv: SiteServer | null = null;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hlm-site-'));
    await fs.writeFile(path.join(dir, 'index.html'), '<p>tape speed</p>');
    await fs.mkdir(path.join(dir, 'assets'));
    await fs.writeFile(path.join(dir, 'assets', 'ok.js'), 'ok');
    srv = await createSiteServer(dir);
  });

  after(async () => {
    await srv?.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('serves the index and a nested file', async () => {
    assert.ok(srv);
    const index = await fetch(`${srv.origin}/`);
    assert.equal(index.status, 200);
    assert.equal(await index.text(), '<p>tape speed</p>');
    const nested = await fetch(`${srv.origin}/assets/ok.js`);
    assert.equal(nested.status, 200);
    assert.equal(await nested.text(), 'ok');
  });

  it('does not serve a path outside the site', async () => {
    assert.ok(srv);
    assert.equal(await statusOf(srv.port, '/../etc/passwd'), 403);
  });

  it('answers 404 for a missing file', async () => {
    assert.ok(srv);
    const res = await fetch(`${srv.origin}/missing.bin`);
    assert.equal(res.status, 404);
  });
});
