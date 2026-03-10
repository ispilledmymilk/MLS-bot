const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getKnowledge: () => ipcRenderer.invoke('get-knowledge'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getComplianceSections: () => ipcRenderer.invoke('get-compliance-sections'),
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  startGoogleAuth: () => ipcRenderer.invoke('start-google-auth'),
});
