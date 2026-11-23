/**
 * Build the client, copy it next to the Electron wrapper, then pack.
 * Usage: node --experimental-strip-types pack.mts -- --win zip --linux dir
 * Artifacts go to desktop/release/. Copied to $HLM_DESKTOP_OUT when set.
 */
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

async function copyOut(from: string, to: string): Promise<void> {
  const info = await stat(from);
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const name of await readdir(from)) {
      await copyOut(path.join(from, name), path.join(to, name));
    }
    return;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await pipeline(createReadStream(from), createWriteStream(to));
}

const desktop = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(desktop, '..');

function run(cmd: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        HLM_SOURCEMAP: 'off',
        // Cross-packing Windows from Linux has no Authenticode cert; skip Wine.
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code ?? '?'}`));
    });
  });
}

const extra = process.argv.includes('--')
  ? process.argv.slice(process.argv.indexOf('--') + 1)
  : process.argv.slice(2);
const builderArgs = extra.length > 0 ? extra : ['--win', 'zip', '--linux', 'dir'];

await run('npm', ['run', 'build:site'], repo);

const site = path.join(desktop, 'site');
await rm(site, { recursive: true, force: true });
await cp(path.join(repo, 'dist'), site, { recursive: true });

await run('npm', ['run', 'compile'], desktop);
await rm(path.join(desktop, 'release'), { recursive: true, force: true });
await run(path.join(desktop, 'node_modules', '.bin', 'electron-builder'), builderArgs, desktop);

const out = process.env.HLM_DESKTOP_OUT;
if (out) {
  await mkdir(out, { recursive: true });
  const release = path.join(desktop, 'release');
  for (const name of await readdir(release)) {
    if (name === 'builder-debug.yml' || name === 'win-unpacked' || name === 'linux-unpacked' || name === 'mac') {
      continue;
    }
    try {
      await copyOut(path.join(release, name), path.join(out, name));
    } catch (err) {
      console.warn(`could not copy ${name} to HLM_DESKTOP_OUT:`, err);
      if (name.endsWith('.zip')) {
        const partsDir = path.join(out, 'LiquidityMapperFast-win');
        await mkdir(partsDir, { recursive: true });
        await run('split', ['-b', '50M', '-d', '-a', '2', path.join(release, name), path.join(partsDir, `${name}.`)], desktop);
        console.warn(`wrote 50 MiB split parts under ${partsDir}`);
      }
    }
  }
  const zipDir = path.join(out, 'liquiditymapperfast-site');
  await rm(zipDir, { recursive: true, force: true });
  await mkdir(zipDir, { recursive: true });
  await cp(site, path.join(zipDir, 'site'), { recursive: true });
  await writeFile(
    path.join(zipDir, 'start.sh'),
    `#!/bin/sh
cd "$(dirname "$0")/site"
python3 -m http.server 5173 --bind 127.0.0.1
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(zipDir, 'start.bat'),
    `@echo off
cd /d "%~dp0site"
python -m http.server 5173 --bind 127.0.0.1
`,
  );
  await writeFile(
    path.join(zipDir, 'README.txt'),
    `LiquidityMapperFast (this branch's client, browser engine — no server keys).

Preferred: unzip LiquidityMapperFast-*-win.zip and double-click LiquidityMapperFast.exe.

This folder is the static site. On Mac/Linux: ./start.sh then open http://127.0.0.1:5173
On Windows without the exe: start.bat (needs Python) then open the same URL.
`,
  );
  await run(
    'zip',
    ['-r', path.join(out, 'liquiditymapperfast-site.zip'), 'liquiditymapperfast-site'],
    out,
  );
}

console.log(`packed ${builderArgs.join(' ')} from ${os.hostname()}`);
