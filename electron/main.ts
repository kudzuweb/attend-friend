import { app, BrowserWindow, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Example: build an absolute path to your built preload
const preloadPath = path.resolve(__dirname, '../electron/preload.js');


let win: BrowserWindow | null = null;

console.log("dirname:", __dirname)
// create the active BrowserWindow, styling, security settings
async function createWindow() {
    console.log("createWindow() called at", new Date())
    win = new BrowserWindow({
        width: 980,
        height: 700,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    if (process.env.NODE_ENV !== 'production') {
        await win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        await win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}


console.log("running main.ts at", new Date())
// app life cycle events
const whenReadyPromise = app.whenReady()
whenReadyPromise.then(createWindow);
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

// IPC handlers 
// check permissions status
ipcMain.handle('screen-permission-status', () => {
    return systemPreferences.getMediaAccessStatus('screen'); // string
});

// open screen recording settings for user to grant permissions
ipcMain.handle('open-screen-recording-settings', async () => {
    if (process.platform === 'darwin') {
        await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
        );
        return { ok: true };
    }
    return { ok: false, reason: 'unsupported_platform' };
});

// get media sources for screenshots
ipcMain.handle('desktopCapturer-get-sources', (_e, opts) => {
    let capturer = desktopCapturer.getSources(opts);
    return capturer
    console.log('desktopCapturer invoked:', capturer)
})

// save screenshots(placeholder currently)
ipcMain.handle('save-image', async (_e, { dataUrl }: { dataUrl: string }) => {
    return { ok: true };
})

// relaunch app
ipcMain.handle('relaunch-app', () => {
    app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) });
    app.exit(0);
});

console.log("attempting to load localhost at", new Date())