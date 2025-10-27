import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';

let win: BrowserWindow | null = null;

// create the active BrowserWindow, styling, security settings
async function createWindow() {
    win = new BrowserWindow({
        width: 980,
        height: 700,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })
}

// switch for prod or dev mode instructions for what to display
if (process.env.NODE_ENV !== 'production') {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
}
else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
}

// app life cycle events
app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// IPC handler to save screenshots(placeholder currently)
ipcMain.handle('save-image', async (_e, { dataUrl }: { dataUrl: string }) => {
    return { ok: true };
})



