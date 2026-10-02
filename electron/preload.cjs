const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,
  setMode: (mode) => ipcRenderer.send('yui:set-mode', mode),
  resize: (width, height) => ipcRenderer.send('yui:resize', { width, height }),
  close: () => ipcRenderer.send('yui:close'),
  minimize: () => ipcRenderer.send('yui:minimize'),
  onCollapse: (callback) => {
    ipcRenderer.on('yui:external-collapse', () => callback());
  },
  onToggleExpand: (callback) => {
    ipcRenderer.on('yui:toggle-expand', () => callback());
  },
  // Desktop Agent Capabilities
  execCmd: (cmd) => ipcRenderer.invoke('yui:exec-cmd', cmd),
  screenshot: () => ipcRenderer.invoke('yui:screenshot'),
  typeKeys: (data) => ipcRenderer.invoke('yui:type-keys', data),
  launchApp: (appName) => ipcRenderer.invoke('yui:launch-app', appName),
  runOpenCode: (data) => ipcRenderer.invoke('yui:run-opencode', data),
  onOpenCodeStream: (callback) => {
    ipcRenderer.on('yui:opencode-stream', (event, data) => callback(data));
  }
});
