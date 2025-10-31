import { app, BrowserWindow, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// create the active BrowserWindow, styling, security settings
let win: BrowserWindow | null = null;

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

// helper functions
// absolute path to built preload
const preloadPath = path.resolve(__dirname, '../electron/preload.js');

// function to get or create app-scoped dir for storage
function getBaseDir() {
    return path.join(app.getPath('userData'));
}
// create ISO filenames with colons replaced
function dateTimeStamp(d = new Date()) {
    return d.toISOString().replace(/:/g, '-');
}
// create short SHA for filenames to distinguish images taken close together
function shortSha(buffer: Buffer, n = 8) {
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, n);
}

function parseDataUrl(dataUrl: string) {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) throw new Error('invalid_data_url');
    const mime = m[1] as `image/${string}`;
    const buffer = Buffer.from(m[2], 'base64');
    let ext: string;
    if (mime === 'image/jpeg') {
        ext = '.jpg'
    } else {
        throw new Error('invalid_image_type');
    };
    return { buffer, ext, mime };
}
// save images
async function atomicScreenshotSave(finalPath: string, buffer: Buffer) {
    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    const tmp = finalPath + '.tmp';

    // create temp file; fail if exists, recover by OVERWRITING
    await fs.writeFile(tmp, buffer, { flag: 'wx' }).catch(async (e) => {
        if (e?.code === 'EEXIST') {
            await fs.writeFile(tmp, buffer);
        } else {
            throw e;
        }
    });

    await fs.rename(tmp, finalPath);
}

// get 10 most recent images(last 5 mins)
function capturesDir() {
    return path.join(app.getPath('userData'), 'captures');
}

async function getRecentImages(limit = 10): Promise<string[]> {
    // retrieve filepaths
    const dir = capturesDir();
    const entries = await fs.readdir(dir).catch(() => []);
    const files = entries
        .filter(f => /\.(jpg|jpeg)$/i.test(f))
        .map(f => path.join(dir, f));
    if (files.length === 0) return [];
    // extract timestamps from metadata
    const getTimeStamps = await Promise.all(
        files.map(async f => ({ f, t: (await fs.stat(f)).mtime.getTime() }))
    );

    return getTimeStamps
        .sort((a, b) => b.t - a.t)
        .slice(0, limit)
        .map(x => x.f);
}

async function fileToDataUrl(file: string): Promise<string> {
    const buffer = await fs.readFile(file);
    const mime = 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

const system_prompt = async function loadPrompt() {
    const promptPath = process.env.PROMPT_FILE;
    if (!promptPath) throw new Error('PROMPT_FILE not set');

    const abs = path.isAbsolute(promptPath)
        ? promptPath
        : path.join(process.resourcesPath, promptPath);

    const content = await fs.readFile(abs, 'utf8');
    return content;
}

async function sendRecentImagestoLLM(limit = 10) {
    const recent = await getRecentImages(limit);
    if (recent.length === 0) {
        return {
            ok: false as const,
            error: 'no images'
        }
    };

    const dataUrls = await Promise.all(recent.map(fileToDataUrl));

    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/+$/, '');
    const apiKey = process.env.OPENAI_API_KEY || '';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) return {
        ok: false as const,
        error: "missing_api_key"
    };

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            temperature: 0,
            messages: [{
                role: 'system',
                content: system_prompt,
            },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'these screenshots portray the last five minutes of activity' },
                    ...dataUrls.map(url => ({
                        type: 'image_url',
                        image_url: { url, detail: 'low' }
                    })),
                ],
            },
            ],
        }),
    });
    const json = await res.json().catch(() => null);
    const text = json?.choices?.[0]?.message?.content;
    return { ok: true as const, text, raw: json, count: recent.length };
}



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

// relaunch app
ipcMain.handle('relaunch-app', () => {
    app.relaunch({ args: process.argv.slice(1).concat(['--relaunch']) });
    app.exit(0);
});


// get media sources for screenshots
ipcMain.handle('desktopCapturer-get-sources', (_e, opts) => {
    return desktopCapturer.getSources(opts);
});

// save screenshots to local storage
ipcMain.handle('save-image', async (_evt, payload: { dataUrl: string; capturedAt: string }) => {
    try {
        const { dataUrl, capturedAt } = payload;
        const d = new Date(capturedAt);
        // decode base64
        const { buffer, ext, mime } = parseDataUrl(dataUrl);

        // create filename and path
        const timeStamp = dateTimeStamp(d);
        const sha = shortSha(buffer);
        const baseDir = path.join(getBaseDir(), 'captures');
        await fs.mkdir(baseDir, { recursive: true });
        const filePath = path.join(baseDir, `${sha}${ext}`);

        await atomicScreenshotSave(filePath, buffer);

        return {
            ok: true as const,
            file: filePath,
            deduped: false,
            bytes: buffer.byteLength,
            capturedAt: d.toISOString(),
            sha: sha,
            mime: mime,
        };
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ok: false as const,
            error: msg
        }
    }
});

// get recent images
ipcMain.handle('images:get-recent', async (_evt, limit?: number) => {
    try {
        return { ok: true as const, files: await getRecentImages(limit ?? 10) };
    } catch (e: any) {
        return { ok: false as const, error: e?.message ?? 'get recent image handler failed' };
    }
});

// send images to LLM
ipcMain.handle('llm:send-recent', async (_evt, limit?: number) => {
    try {
        return await sendRecentImagestoLLM(limit ?? 10);
    } catch (e: any) {
        return { ok: false as const, error: e?.message ?? 'send recent image handler failed' };
    }
});


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