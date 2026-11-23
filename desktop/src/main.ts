import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteServer, type SiteServer } from './site-server.js';

function siteRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'site');
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
}

let server: SiteServer | null = null;

async function openWindow(): Promise<void> {
  server = await createSiteServer(siteRoot());
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 560,
    title: 'LiquidityMapperFast',
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: undefined,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(server.origin);
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  const held = server;
  server = null;
  if (held) void held.close();
});

void app.whenReady().then(() => openWindow());
