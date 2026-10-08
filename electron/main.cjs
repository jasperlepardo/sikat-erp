// Electron shell: Sikat ERP in a desktop window that opens at 1024×768 and can be resized.
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const WINDOW = { width: 1024, height: 768, minWidth: 800, minHeight: 600 };
// The native title bar is hidden; the page draws its own in the app shell navbar's colour (stone-900 in both
// themes), and the window controls sit on it. Keep the height in step with --titlebar-height in index.css.
const TITLE_BAR = { color: '#1c1917', height: 28 };

function createWindow() {
  const win = new BrowserWindow({
    ...WINDOW,
    center: true,
    title: 'Sikat ERP',
    backgroundColor: TITLE_BAR.color,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 10, y: (TITLE_BAR.height - 14) / 2 }, // macOS: centred in the title bar.
    titleBarOverlay: { color: TITLE_BAR.color, symbolColor: '#fafaf9', height: TITLE_BAR.height }, // Windows/Linux.
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());

  // Links that open a new window (docs, BIR sites…) go to the user's browser, not a second app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // `npm run electron:dev` points at the Vite dev server; otherwise load the build (hash routing works over file://).
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
