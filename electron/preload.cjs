const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  setMode: (mode) => ipcRenderer.send('yui:set-mode', mode),
  resize: (width, height) => ipcRenderer.send('yui:resize', { width, height }),
  close: () => ipcRenderer.send('yui:close'),
  minimize: () => ipcRenderer.send('yui:minimize')
});
