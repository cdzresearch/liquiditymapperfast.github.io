@echo off
setlocal
cd /d "%~dp0"
title LiquidityMapperFast
echo Starting http://127.0.0.1:5173/
echo Leave this black window open while you use the page.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo.
  echo start.ps1 failed. This is not the GitHub source repo — you need the site zip:
  echo https://github.com/cdzresearch/liquiditymapperfast.github.io/releases/download/tape-speed-site/liquiditymapperfast-tape-speed-site.zip
  pause
)
echo.
pause
