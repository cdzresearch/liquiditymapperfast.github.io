# Desktop wrapper

A small Electron window that serves this branch’s built client (`dist/`) on loopback and opens it. The page talks to the exchanges from the browser; no server keys.

Packed Windows/Linux binaries are **not** committed. Build them on this machine:

```
cd desktop
npm install
npm test
npm run pack
```

`npm run pack` typechecks and builds the site, copies it to `desktop/site/`, then runs electron-builder (`--win zip` and `--linux dir` by default). Output is `desktop/release/`.

- **Windows:** unzip `LiquidityMapperFast-*-win.zip` (keep the folder together — the `.exe` needs its DLLs) and double-click `LiquidityMapperFast.exe`. This Linux packer cannot emit a single-file NSIS portable `.exe` (that step needs Wine).
- **Linux:** run `desktop/release/linux-unpacked/LiquidityMapperFast`.
- **Mac:** `npm run pack -- -- --mac zip` on a Mac (this Linux packer skips a signed `.app`).

`HLM_DESKTOP_OUT=/opt/cursor/artifacts npm run pack` also copies the zip, the Linux folder, and a static-site zip with `start.sh` / `start.bat`.
