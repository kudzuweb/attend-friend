import { app, BrowserWindow, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

async function createWindow() {
    console.log("createWindow() called at", new Date())
    const size = 100;
    win = new BrowserWindow({
        width: size,
        height: size,
        // useContentSize: true,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: true,
        hasShadow: false,
        fullscreenable: false,
        skipTaskbar: true,
        // vibrancy: 'sidebar',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    // widget config
    win.setAlwaysOnTop(true, 'floating', 1);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // hide from task switchers, etc, so it acts like a utility HUD instead of a window
    if (process.platform === 'darwin') app.dock?.hide();
    // hard-clamp size so mac can’t “help” by overriding my resizable: false
    win.setMinimumSize(100, 100);
    win.setMaximumSize(100, 100);
    win.setAspectRatio(1);



    // load renderer
    if (process.env.NODE_ENV !== 'production') {
        await win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        await win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // win.setContentSize(100, 100);
    win.setBounds({ width: size, height: size, x: win.getBounds().x, y: win.getBounds().y });

    win.show();
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

// ensuring the filepath to the system prompt feeds correctly
async function resolvePromptPath(input: string): Promise<string> {
    if (path.isAbsolute(input)) {
        // absolute wins
        return input;
    }

    const filepathCandidates = [
        // dev: next to source
        path.join(__dirname, '..', input),
        path.join(__dirname, '..', '..', input),
        // dev: project root cwd
        path.join(process.cwd(), input),
        // 3) electron app root (dev: project dir; prod: app.asar)
        path.join(app.getAppPath(), input),
        // 4) packaged app Resources (only works if you copy the file there at build)
        path.join(process.resourcesPath, input),
    ];

    for (const abs of filepathCandidates) {
        try {
            await fs.access(abs);
            return abs;
        } catch { }
    }
    throw new Error(
        `prompt not found. tried:\n${filepathCandidates.join('\n')}\n`
    );
}


const get_system_prompt = async function loadPrompt(): Promise<string> {
    const promptPath = process.env.PROMPT_FILE;
    if (!promptPath) throw new Error('PROMPT_FILE not set');

    const abs = await resolvePromptPath(promptPath);
    const content = await fs.readFile(abs, 'utf8');
    if (!content.trim()) throw new Error(`prompt file is empty: ${abs}`)

    return content;
}

const systemPromptText = await get_system_prompt();

async function sendRecentImagestoLLM(limit = 10) {
    const recent = await getRecentImages(limit);
    if (recent.length === 0) {
        return {
            ok: false as const,
            error: 'no images'
        }
    };

    const dataUrls = await Promise.all(recent.map(fileToDataUrl));

    // console.log('type:', typeof systemPromptText, 'text:', systemPromptText);

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
            // response_format: { type: 'json_object' },
            temperature: 0,
            messages: [{
                'role': 'system',
                'content': systemPromptText,
            },
            {
                'role': 'user',
                'content': [
                    { 'type': 'text', 'text': 'these screenshots portray the last five minutes of activity:' },
                    ...dataUrls.map(url => ({
                        'type': 'image_url',
                        'image_url': { url, detail: 'low' }
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