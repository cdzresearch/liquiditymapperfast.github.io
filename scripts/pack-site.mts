/**
 * Zip the Vite `dist/` with double-click launchers (no Electron, no Node).
 * Usage: npm run pack:site
 * Writes dist/liquiditymapperfast-tape-speed-site.zip (gitignored via dist/).
 */
import { spawn } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'dist');
const launchers = path.join(repo, 'scripts', 'portable-site');

function run(cmd: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code ?? '?'}`));
    });
  });
}

const staging = await mkdtemp(path.join(os.tmpdir(), 'hlm-site-'));
try {
  await cp(dist, staging, {
    recursive: true,
    filter: (src) => !src.endsWith('.zip'),
  });
  for (const name of ['README.txt', 'start.bat', 'start.ps1', 'start.sh'] as const) {
    await cp(path.join(launchers, name), path.join(staging, name));
  }
  await chmod(path.join(staging, 'start.sh'), 0o755);
  const zipName = 'liquiditymapperfast-tape-speed-site.zip';
  const zipPath = path.join(dist, zipName);
  await rm(zipPath, { force: true });
  await mkdir(path.dirname(zipPath), { recursive: true });
  await run('zip', ['-r', '-q', zipPath, '.'], staging);
  console.log(zipPath);
} finally {
  await rm(staging, { recursive: true, force: true });
}
