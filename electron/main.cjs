const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Set application identity
app.setName('yui-companion');
if (process.platform === 'win32') {
  app.setAppUserModelId('yui-companion');
}

// Clean stale Chromium SingletonLock if the PID is dead
function cleanStaleSingletonLock() {
  try {
    const userData = app.getPath('userData');
    const lockPath = path.join(userData, 'SingletonLock');
    if (fs.existsSync(lockPath)) {
      try {
        const link = fs.readlinkSync(lockPath);
        const match = link.match(/-(\d+)$/);
        if (match) {
          const pid = parseInt(match[1], 10);
          try {
            process.kill(pid, 0);
          } catch (e) {
            if (e.code === 'ESRCH') {
              fs.unlinkSync(lockPath);
              const socketPath = path.join(userData, 'SingletonSocket');
              if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
            }
          }
        }
      } catch (err) {}
    }
  } catch (err) {}
}

cleanStaleSingletonLock();

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
    title: "YUI — Notch Companion Agent",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();

    // In Sway, position window flush at top center
    if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY) {
      exec(`swaymsg '[app_id="yui-companion"] move position ${bounds.x} px 0 px'`, () => {});
    }
  });

  // Stay on top
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    mainWindow.setAlwaysOnTop(true);
  }

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

    // On Sway, ensure x position is re-centered when width expands/collapses
    if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY) {
      exec(`swaymsg '[app_id="yui-companion"] move position ${newBounds.x} px 0 px'`, () => {});
    }
  });

  ipcMain.on('yui:resize', (event, { width, height }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = Math.round((screenWidth - width) / 2);
    mainWindow.setBounds({ x, y: 0, width, height }, true);

    if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY) {
      exec(`swaymsg '[app_id="yui-companion"] move position ${x} px 0 px'`, () => {});
    }
  });

  ipcMain.on('yui:close', () => {
    app.quit();
  });

  ipcMain.on('yui:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY) {
        exec('swaymsg \'[app_id="yui-companion"] move scratchpad\'', () => {});
      } else {
        mainWindow.minimize();
      }
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
      if (process.platform === 'linux' && process.env.WAYLAND_DISPLAY) {
        exec('swaymsg \'[app_id="yui-companion"] scratchpad show, sticky enable, focus\'', () => {});
      }
      if (!mainWindow.isVisible()) mainWindow.show();
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
