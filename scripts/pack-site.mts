/**
 * Zip the Vite `dist/` with double-click launchers (no Electron, no Node).
 * Usage: npm run pack:site
 * Writes dist/liquiditymapperfast-tape-speed-site.zip (gitignored via dist/).
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'dist');

const README = `Double-click start.bat (Windows) or start.sh (Mac/Linux). Chrome opens http://127.0.0.1:5173/
Do not open index.html as a file — workers cannot start, so the page stays blank.
There is no npx or serve program in this folder; start.bat is the launcher (Python or PowerShell).
`;

const START_BAT = `@echo off
setlocal
cd /d "%~dp0"
set PORT=5173
where py >nul 2>&1
if %errorlevel%==0 (
  py -c "import http.server" 1>nul 2>nul
  if %errorlevel%==0 (
    start "" "http://127.0.0.1:%PORT%/"
    echo Serving at http://127.0.0.1:%PORT%/  Close this window to stop.
    py -m http.server %PORT% --bind 127.0.0.1
    goto :eof
  )
)
where python >nul 2>&1
if %errorlevel%==0 (
  python -c "import http.server" 1>nul 2>nul
  if %errorlevel%==0 (
    start "" "http://127.0.0.1:%PORT%/"
    echo Serving at http://127.0.0.1:%PORT%/  Close this window to stop.
    python -m http.server %PORT% --bind 127.0.0.1
    goto :eof
  )
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo Could not start a local web server. Install Python from python.org, then double-click start.bat again.
  pause
)
`;

const START_PS1 = `$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$port = 5173
$mime = @{
  '.css' = 'text/css; charset=utf-8'
  '.html' = 'text/html; charset=utf-8'
  '.ico' = 'image/x-icon'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'
  '.map' = 'application/json'
  '.png' = 'image/png'
  '.svg' = 'image/svg+xml'
  '.wasm' = 'application/wasm'
  '.webmanifest' = 'application/manifest+json'
}
$listener = New-Object System.Net.HttpListener
$bound = $false
for ($p = $port; $p -lt $port + 20; $p++) {
  try {
    $listener.Prefixes.Clear()
    $listener.Prefixes.Add("http://127.0.0.1:$p/")
    $listener.Start()
    $port = $p
    $bound = $true
    break
  } catch {
    $listener = New-Object System.Net.HttpListener
  }
}
if (-not $bound) { throw 'Could not bind a local port.' }
$url = "http://127.0.0.1:$port/"
Write-Host "Serving $root at $url  Close this window to stop."
Start-Process $url
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrEmpty($rel) -or $rel.EndsWith('/')) { $rel += 'index.html' }
  $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
  $rootFull = [IO.Path]::GetFullPath($root)
  if (-not $file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    $ctx.Response.StatusCode = 403
    $ctx.Response.Close()
    continue
  }
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    $ctx.Response.StatusCode = 404
    $ctx.Response.Close()
    continue
  }
  $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}
`;

const START_SH = `#!/bin/sh
cd "$(dirname "$0")"
PORT=5173
echo "Serving at http://127.0.0.1:$PORT/  Close this window to stop."
(sleep 1; command -v open >/dev/null && open "http://127.0.0.1:$PORT/" || command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT/" || true) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
`;

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
  await writeFile(path.join(staging, 'README.txt'), README);
  await writeFile(path.join(staging, 'start.bat'), START_BAT.replaceAll('\n', '\r\n'));
  await writeFile(path.join(staging, 'start.ps1'), START_PS1.replaceAll('\n', '\r\n'));
  await writeFile(path.join(staging, 'start.sh'), START_SH, { mode: 0o755 });
  const zipName = 'liquiditymapperfast-tape-speed-site.zip';
  const zipPath = path.join(dist, zipName);
  await rm(zipPath, { force: true });
  await mkdir(path.dirname(zipPath), { recursive: true });
  await run('zip', ['-r', '-q', zipPath, '.'], staging);
  console.log(zipPath);
} finally {
  await rm(staging, { recursive: true, force: true });
}
