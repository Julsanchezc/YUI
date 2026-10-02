const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

// Set application identity
app.setName('yui-companion');
if (process.platform === 'win32') {
  app.setAppUserModelId('yui-companion');
}

// Memory optimization flags (safe for Linux GPU / Wayland)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling', 'false');

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

// Dimensions for the 3 Dynamic Island Modes
const SIZES = {
  pill: { width: 380, height: 42 },
  compact: { width: 480, height: 56 },
  expanded: { width: 640, height: 500 }
};

let mainWindow = null;
let currentMode = 'pill';

// Calculate bounds centered at top edge of the primary display
function getWindowBounds(mode) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const size = SIZES[mode] || SIZES.pill;
  const x = Math.round((screenWidth - size.width) / 2);
  const y = 30;
  return { x, y, width: size.width, height: size.height };
}

function applyCompositorGeometry(width, height, x, y = 30) {
  if (process.platform !== 'linux') return;
  if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
    exec('hyprctl clients -j', (err, stdout) => {
      if (!err && stdout) {
        try {
          const clients = JSON.parse(stdout);
          const yui = clients.find(c => c.class === 'yui-companion' || (c.class && c.class.toLowerCase().includes('yui')));
          if (yui) {
            exec(`hyprctl dispatch resizewindowpixel "exact ${width} ${height},address:${yui.address}"`, () => {
              setTimeout(() => {
                exec(`hyprctl dispatch movewindowpixel "exact ${x} ${y},address:${yui.address}"`);
              }, 30);
            });
          }
        } catch (e) {}
      }
    });
  } else if (process.env.WAYLAND_DISPLAY) {
    exec(`swaymsg '[app_id="yui-companion"] resize set width ${width} px height ${height} px, move position ${x} px ${y} px'`, () => {});
  }
}

function updateWindowMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  currentMode = mode;
  const newBounds = getWindowBounds(mode);
  mainWindow.setBounds(newBounds, true);
  applyCompositorGeometry(newBounds.width, newBounds.height, newBounds.x, newBounds.y);
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

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error(`[Load Error] ${code}: ${desc} at ${url}`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();

    applyCompositorGeometry(bounds.width, bounds.height, bounds.x, bounds.y);
  });

  // Auto-collapse when user clicks outside the window (onBlur)
  mainWindow.on('blur', () => {
    if (currentMode === 'expanded') {
      mainWindow.webContents.send('yui:external-collapse');
      updateWindowMode('pill');
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
    updateWindowMode(mode);
  });

  ipcMain.on('yui:resize', (event, { width, height }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = Math.round((screenWidth - width) / 2);
    mainWindow.setBounds({ x, y: 0, width, height }, true);
    applyCompositorGeometry(width, height, x, 0);
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

  // Desktop Agent Capabilities (Terminal, Screenshot, Keyboard, Apps, OpenCode)
  ipcMain.handle('yui:exec-cmd', async (event, cmd) => {
    return new Promise((resolve) => {
      exec(cmd, { cwd: process.env.HOME || '/home/niko', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({
          success: !err,
          stdout: stdout ? stdout.trim() : '',
          stderr: stderr ? stderr.trim() : '',
          exitCode: err ? (err.code || 1) : 0
        });
      });
    });
  });

  ipcMain.handle('yui:screenshot', async () => {
    return new Promise((resolve) => {
      const outPath = '/tmp/yui_desktop_snap.png';
      exec(`grim ${outPath}`, (err) => {
        if (err) return resolve({ success: false, error: err.message });
        try {
          const data = fs.readFileSync(outPath);
          const base64 = data.toString('base64');
          resolve({ success: true, path: outPath, base64 });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    });
  });

  ipcMain.handle('yui:type-keys', async (event, { text, key }) => {
    return new Promise((resolve) => {
      let command = '';
      if (text) {
        command = `wtype "${text.replace(/"/g, '\\"')}"`;
      } else if (key) {
        command = `wtype -k ${key}`;
      }
      if (!command) return resolve({ success: false });
      exec(command, (err) => {
        resolve({ success: !err });
      });
    });
  });

  ipcMain.handle('yui:launch-app', async (event, appName) => {
    return new Promise((resolve) => {
      exec(`nohup ${appName} </dev/null >/dev/null 2>&1 & disown`, (err) => {
        resolve({ success: !err });
      });
    });
  });

  ipcMain.handle('yui:run-opencode', async (event, { prompt, file }) => {
    return new Promise((resolve) => {
      const args = ['run', '--format', 'json', '--auto'];
      if (file) args.push('--file', file);
      args.push(prompt);

      const opencodeProc = spawn('/usr/bin/opencode', args, {
        cwd: process.env.HOME || '/home/niko',
        env: { ...process.env, PATH: (process.env.PATH || '') + ':/usr/local/bin:/usr/bin' }
      });

      let stdoutData = '';
      let stderrData = '';

      opencodeProc.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutData += text;
        const lines = text.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line.trim());
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('yui:opencode-stream', parsed);
            }
          } catch (e) {}
        }
      });

      opencodeProc.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      opencodeProc.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdoutData,
          error: stderrData,
          exitCode: code
        });
      });

      opencodeProc.on('error', (err) => {
        resolve({
          success: false,
          error: err.message,
          exitCode: 1
        });
      });
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Global OS signal listeners (SIGUSR1 / SIGUSR2) to toggle expanded mode instantly
function toggleExpandMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (currentMode === 'expanded') {
    mainWindow.webContents.send('yui:external-collapse');
    updateWindowMode('pill');
  } else {
    mainWindow.webContents.send('yui:toggle-expand');
    updateWindowMode('expanded');
    mainWindow.focus();
  }
}

try {
  process.removeAllListeners('SIGUSR1');
} catch (e) {}

process.on('SIGUSR1', toggleExpandMode);
process.on('SIGUSR2', toggleExpandMode);

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
