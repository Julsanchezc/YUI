const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Dimensions for the Dynamic Island Notch
const SIZES = {
  pill: { width: 380, height: 64 },
  expanded: { width: 680, height: 560 }
};

let mainWindow = null;
let currentMode = 'pill';

// Calculate bounds centered at top edge of the primary display
function getWindowBounds(mode) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const size = SIZES[mode] || SIZES.pill;
  const x = Math.round((screenWidth - size.width) / 2);
  const y = 0;
  return { x, y, width: size.width, height: size.height };
}

function createWindow() {
  const bounds = getWindowBounds(currentMode);

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Make sure it stays on top on all workspaces / full screen
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Load production dist or dev server
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    const candidates = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(__dirname, 'dist', 'index.html'),
      path.join(__dirname, '..', 'index.html'),
      path.join(__dirname, 'index.html')
    ];
    const target = candidates.find(p => fs.existsSync(p));
    if (target) {
      mainWindow.loadFile(target);
    } else {
      console.error("No se encontró index.html en candidatos:", candidates);
    }
  }

  // Handle IPC mode changes from frontend
  ipcMain.on('yui:set-mode', (event, mode) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    currentMode = mode;
    const newBounds = getWindowBounds(mode);
    mainWindow.setBounds(newBounds, true);
  });

  ipcMain.on('yui:resize', (event, { width, height }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = Math.round((screenWidth - width) / 2);
    mainWindow.setBounds({ x, y: 0, width, height }, true);
  });

  ipcMain.on('yui:close', () => {
    app.quit();
  });

  ipcMain.on('yui:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
