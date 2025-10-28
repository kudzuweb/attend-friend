const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

// get media sources
async function listScreens() {
    return ipcRenderer.invoke('desktopCapturer-get-sources', { types: ['screen'] })
}

// screenshot function
async function captureOnce() {
    console.log("desktopCapturer", desktopCapturer)
    // returns a data URL of a JPEG
    const sources = await listScreens();
    const source = sources[0];
    // TODO: add a picker for multiple displays

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            // @ts-expect-error chromium-specific constraints allowing more granular control
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                maxWidth: 1024,
                maxHeight: 1024,
                maxFrameRate: 1,
            }
        }
    })

    // create a hidden <video> to pipe video to
    const video = document.createElement('video');
    video.srcObject = stream;

    // wait for video frame to actually exist before trying to use it
    await new Promise(res => {
        video.onloadedmetadata = () => {
            video.play().then(() => res());
        };
    });

    //create canvas, match size to video frame size, copy the frame onto it
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // cleanup: turn off the capture feed after grabbing frame
    video.pause();
    stream.getTracks().forEach(t => t.stop());

    // export JPEG, quality setting
    return canvas.toDataURL('image/jpeg', 0.6)
}

console.log("running preload!!!")
// expose safe APIs to the webpage(constrains node access)
const api = Object.freeze({
    captureOnce,
    saveImage: (dataUrl) =>
        ipcRenderer.invoke('save-image',
            { dataUrl },
        ),
    openScreenRecordingSettings: () =>
        ipcRenderer.invoke('open-screen-recording-settings'),
    relaunchApp: () =>
        ipcRenderer.invoke('relaunch-app'),
})

contextBridge.exposeInMainWorld('api', api)