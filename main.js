const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Export PDF
ipcMain.handle('export-pdf', async () => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save PDF',
      defaultPath: 'inventory-report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled) return { canceled: true };

    const pdfData = await mainWindow.webContents.printToPDF({});
    fs.writeFileSync(filePath, pdfData);
    return { filePath };
  } catch (err) {
    return { error: err.message };
  }
});

// Export CSV
ipcMain.handle('export-csv', async (event, csvContent) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save CSV',
      defaultPath: 'inventory-report.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (canceled) return { canceled: true };

    fs.writeFileSync(filePath, csvContent, 'utf8');
    return { filePath };
  } catch (err) {
    return { error: err.message };
  }
});
