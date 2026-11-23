# Serves this folder at http://127.0.0.1:5173/ then opens Chrome.
# No Python or Node. Leave this window open. TcpListener (no admin URL ACL).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$port = 5173
$url = "http://127.0.0.1:$port/"

function Fail([string]$msg) {
  Write-Host $msg
  Write-Host 'Press Enter to close this window.'
  try { [void][Console]::ReadLine() } catch { Start-Sleep 20 }
  exit 1
}

function Open-Chrome([string]$target) {
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  )
  foreach ($exe in $candidates) {
    if ($exe -and (Test-Path -LiteralPath $exe)) {
      Start-Process -FilePath $exe -ArgumentList $target
      return
    }
  }
  Start-Process $target
}

function Wait-Port {
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $c = New-Object System.Net.Sockets.TcpClient
      $c.Connect('127.0.0.1', $port)
      $c.Close()
      return
    } catch {
      Start-Sleep -Milliseconds 100
    }
  }
  Fail "The server did not start on $url"
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'index.html'))) {
  Fail @"
This folder is not the site zip (no index.html next to start.bat).
Download liquiditymapperfast-tape-speed-site.zip from:
https://github.com/cdzresearch/liquiditymapperfast.github.io/releases/download/tape-speed-site/liquiditymapperfast-tape-speed-site.zip
Unzip it, then double-click start.bat in THAT folder — not the GitHub source repo.
"@
}

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

$already = $false
try {
  $probe = New-Object System.Net.Sockets.TcpClient
  $probe.Connect('127.0.0.1', $port)
  $probe.Close()
  $already = $true
} catch { }

if ($already) {
  Write-Host "Already serving $url"
  Open-Chrome $url
  Write-Host 'Chrome opened. This window can stay open or you can close it.'
  try { [void][Console]::ReadLine() } catch { Start-Sleep 20 }
  exit 0
}

try {
  $server = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Parse('127.0.0.1'), $port)
  $server.Start()
} catch {
  Fail "Could not listen on $url : $($_.Exception.Message)"
}

Wait-Port
Write-Host "Serving $root"
Write-Host "Leave this window open. Chrome: $url"
Open-Chrome $url

$rootFull = [IO.Path]::GetFullPath($root)
while ($true) {
  try {
    $client = $server.AcceptTcpClient()
  } catch {
    break
  }
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 10000
    $buf = New-Object byte[] 8192
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { $client.Close(); continue }
    $req = [Text.Encoding]::ASCII.GetString($buf, 0, $n)
    $line = ($req -split "`r?`n")[0]
    $parts = $line -split ' '
    $path = '/'
    if ($parts.Length -ge 2) { $path = $parts[1] }
    $q = $path.IndexOf('?')
    if ($q -ge 0) { $path = $path.Substring(0, $q) }
    $rel = [Uri]::UnescapeDataString($path.TrimStart('/'))
    if ([string]::IsNullOrEmpty($rel) -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $rootFull $rel))
    $status = 200
    $type = 'application/octet-stream'
    $bytes = [byte[]]@()
    if (-not $file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      $status = 403
    } elseif (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $status = 404
    } else {
      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $type = $mime[$ext] }
      $bytes = [IO.File]::ReadAllBytes($file)
    }
    $reason = switch ($status) { 200 { 'OK' } 403 { 'Forbidden' } default { 'Not Found' } }
    $head = "HTTP/1.1 $status $reason`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    $hb = [Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    if ($bytes.Length -gt 0) { $stream.Write($bytes, 0, $bytes.Length) }
    $stream.Flush()
  } catch {
    # drop a bad request; keep listening
  } finally {
    try { $client.Close() } catch { }
  }
}
