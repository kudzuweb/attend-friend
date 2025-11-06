import { app, BrowserWindow, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;
let panelWin: BrowserWindow | null = null;

// session state
interface SessionState {
    isActive: boolean;
    lengthMs: number;
    startTime: number;
    endTime: number;
}

let sessionState: SessionState = {
    isActive: false,
    lengthMs: 0,
    startTime: 0,
    endTime: 0,
};

let sessionTimerRef: NodeJS.Timeout | null = null;
let sessionScreenshotTimerRef: NodeJS.Timeout | null = null;

// track pending panel options to send after load
let pendingPanelOptions: { setupSession?: boolean } | null = null;

const CIRCLE_SIZE = 200;
const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 380;

// circle widget
async function createWindow() {
    console.log("createWindow() called at", new Date())
    win = new BrowserWindow({
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        // useContentSize: true,
        show: false,
        frame: false,
        transparent: true,
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
    win.setMinimumSize(CIRCLE_SIZE, CIRCLE_SIZE);
    win.setMaximumSize(CIRCLE_SIZE, CIRCLE_SIZE);
    win.setAspectRatio(1);



    // load renderer
    if (process.env.NODE_ENV !== 'production') {
        await win.loadURL('http://localhost:5173');
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        await win.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    win.setBounds({ width: CIRCLE_SIZE, height: CIRCLE_SIZE, x: win.getBounds().x, y: win.getBounds().y });

    win.show();
    // keep panel centered below circle
    win.on('move', () => {
        if (!win || !panelWin || !panelWin.isVisible()) return;
        const b = win.getBounds();
        const centeredX = b.x + (b.width - PANEL_WIDTH) / 2;
        panelWin.setPosition(Math.round(centeredX), b.y + b.height);
    });


}

// speech bubble panel
function showPanel() {
    if (!win) return;

    if (!panelWin) {
        panelWin = new BrowserWindow({
            parent: win!,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
            frame: false,
            transparent: false,
            backgroundColor: '#F6F4EE',
            show: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            webPreferences: {
                preload: preloadPath, // or a separate preload if you want
            },
        });

        // Listen for when the panel is ready, then send pending options
        panelWin.webContents.once('did-finish-load', () => {
            if (pendingPanelOptions?.setupSession) {
                panelWin?.webContents.send('panel:show-session-setup');
                pendingPanelOptions = null;
            }
        });

        // load renderer
        if (process.env.NODE_ENV !== 'production') {
            panelWin.loadURL('http://localhost:5173/#/panel');
            panelWin.webContents.openDevTools({ mode: 'detach' });
        } else {
            panelWin.loadURL(`file://${path.join(__dirname, '../dist/index.html')}#/panel`);
        }
    }
    const parentBounds = win.getBounds();
    const centeredX = parentBounds.x + (parentBounds.width - PANEL_WIDTH) / 2;
    // position it right below the circle
    panelWin.setBounds({
        x: Math.round(centeredX),
        y: parentBounds.y + parentBounds.height,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
    });

    panelWin.show();

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

// session management functions
function broadcastSessionState() {
    win?.webContents.send('session:updated', sessionState);
    panelWin?.webContents.send('session:updated', sessionState);
}

async function startSessionScreenshots(lengthMs: number) {
    // First screenshot at 30 seconds in
    const firstScreenshotTime = 30_000;

    // Schedule first screenshot
    sessionScreenshotTimerRef = setTimeout(async () => {
        if (!sessionState.isActive) return;
        await captureAndSaveScreenshot();

        // Then schedule subsequent screenshots every 30 seconds
        sessionScreenshotTimerRef = setInterval(async () => {
            if (!sessionState.isActive) {
                clearInterval(sessionScreenshotTimerRef!);
                return;
            }
            await captureAndSaveScreenshot();
        }, 30_000);
    }, firstScreenshotTime);
}

async function captureAndSaveScreenshot() {
    try {
        // This would need to be called from renderer, but for now we'll handle it differently
        // We'll signal the widget to capture when session is active
    } catch (e) {
        console.error('screenshot capture error:', e);
    }
}

function stopSession() {
    sessionState.isActive = false;
    sessionState.lengthMs = 0;
    sessionState.startTime = 0;
    sessionState.endTime = 0;

    if (sessionTimerRef) clearTimeout(sessionTimerRef);
    if (sessionScreenshotTimerRef) clearTimeout(sessionScreenshotTimerRef);
    sessionTimerRef = null;
    sessionScreenshotTimerRef = null;

    broadcastSessionState();
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
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'focus_assessment',
                    schema: {
                        type: 'object',
                        properties: {
                            status: {
                                type: 'string',
                                enum: ['on_task', 'drifted'],
                            },
                            analysis: {
                                type: 'string',
                            },
                            suggested_prompt: {
                                type: 'string',
                            },
                            summary: {
                                type: 'string',
                            },
                        },
                        required: ['status', 'analysis', 'suggested_prompt', 'summary'],
                        additionalProperties: false,
                    },
                    // strict: true,
                },
            },
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
    const responseString = await res.json().catch(() => null);
    console.log('sendrecentimages responseString:', responseString)

    const content = responseString?.choices?.[0]?.message?.content;
    console.log('sendrecentimages content:', content)

    let structured: any = null;

    try {
        structured = JSON.parse(content);
    } catch {
        throw new Error('could not parse llm response to json')
    }

    console.log('sendrecentimages structured:', structured)
    return { ok: true as const, structured: structured, raw: responseString, count: recent.length };
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
        const res = await sendRecentImagestoLLM(limit ?? 10);

        if (res?.ok && res?.structured) {
            const status = res.structured.status;
            if (status === 'drifted') {
                showPanel();
                // push data into panel here?
                // panelWin?.webContents.send('panel:update-data', res.structured);
            } else if (status === 'on_task') {
                panelWin?.hide();
            }
        }
        return res;
    }
    catch (e: any) {
        return { ok: false as const, error: e?.message ?? 'send recent image handler failed' };
    }
});

// show/hide interface panel
ipcMain.handle('panel:show', (_evt, options?: { setupSession?: boolean }) => {
    // Store options to send after panel loads
    if (options?.setupSession) {
        pendingPanelOptions = options;
    }
    showPanel();
});

ipcMain.handle('panel:hide', () => {
    if (panelWin) panelWin.hide();
});

// session handlers
ipcMain.handle('session:start', (_evt, lengthMs: number) => {
    if (sessionState.isActive) {
        return { ok: false as const, error: 'session already active' };
    }

    const startTime = Date.now();
    const endTime = startTime + lengthMs;

    sessionState.isActive = true;
    sessionState.lengthMs = lengthMs;
    sessionState.startTime = startTime;
    sessionState.endTime = endTime;

    broadcastSessionState();

    // Start the screenshot loop (first screenshot at +30s)
    void startSessionScreenshots(lengthMs);

    // Schedule session end
    sessionTimerRef = setTimeout(() => {
        stopSession();
        // Reopen panel to show analysis
        showPanel();
    }, lengthMs);

    return { ok: true as const };
});

ipcMain.handle('session:get-state', () => {
    return sessionState;
});

ipcMain.handle('session:stop', () => {
    stopSession();
    return { ok: true as const };
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