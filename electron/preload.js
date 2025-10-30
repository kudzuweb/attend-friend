const { contextBridge, ipcRenderer } = require('electron');

// function to check permissions status
async function getScreenPermissionStatus() {
    return ipcRenderer.invoke('screen-permission-status');
}

// function to get media sources
async function listScreens() {
    return ipcRenderer.invoke('desktopCapturer-get-sources', { types: ['screen'] })
}

// screenshot function
async function captureFrames(options) {
    // constraining resolution and quality to minimize cost while ensuring legibility for LLM
    const maxLongEdge = options?.maxLongEdge ?? 1440;
    const jpegQuality = options?.jpegQuality ?? 0.85;

    // select display as source
    const sources = await listScreens();
    const source = sources[0];
    // TODO: add a picker for multiple displays


    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            // @ts-expect-error: chromium-specific WebRTC constraints
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                maxWidth: 8000,
                maxHeight: 8000,
                maxFrameRate: 1,
            },
            // ensure cursor shows
            cursor: 'always',
        }
    });

    // create a hidden <video> to pipe video to
    const video = document.createElement('video');
    video.srcObject = stream;

    // wait for video frame to actually exist before trying to use it
    await new Promise(res => {
        video.onloadedmetadata = () => {
            video.play().then(() => res());
        };
    });
    // compute target size, preserving aspect ratio
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const scale = Math.min(1, maxLongEdge / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));


    //create canvas, match size to video frame size, copy the frame onto it
    const canvas = document.createElement('canvas');
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext('2d', { alpha: false });
    // high quality resampling to preserve text fidelity
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // cleanup: turn off the capture feed after grabbing frame and reset source
    video.pause();

    // @ts-expect-error: srcObject assignment
    video.srcObject = null;
    video.remove();
    stream.getTracks().forEach(t => t.stop());

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            'image/jpeg',
            jpegQuality,
        )
    });
    // convert blob to base64
    const arrayBuf = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString('base64');
    // export dataURL
    return {
        dataUrl: `data:image/jpeg;base64,${base64}`,
        capturedAt: new Date().toISOString(),
    };
}

console.log("running preload!!!")
// expose safe APIs to the webpage(constrains node access)
const api = Object.freeze({
    getScreenPermissionStatus,
    captureFrames: captureFrames,
    saveImage: (payload) =>
        ipcRenderer.invoke('save-image', payload),
    openScreenRecordingSettings: () =>
        ipcRenderer.invoke('open-screen-recording-settings'),
    relaunchApp: () =>
        ipcRenderer.invoke('relaunch-app'),
})

contextBridge.exposeInMainWorld('api', api)