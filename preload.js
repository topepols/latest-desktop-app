const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  exportPDF: () => ipcRenderer.invoke('export-pdf'),
  exportCSV: (csv) => ipcRenderer.invoke('export-csv', csv)
});
