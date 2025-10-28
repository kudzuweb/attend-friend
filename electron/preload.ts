import { contextBridge, ipcRenderer, desktopCapturer, DesktopCapturerSource } from "electron";


// safe bridge to open screen recording settings and relaunch(if it fails due to permissions)
contextBridge.exposeInMainWorld('api', {
    openScreenRecordingSettings: () =>
        ipcRenderer.invoke('relaunch-app'),
});


// screenshot function
async function captureOnce(): Promise<string> {
    // returns a data URL of a JPEG
    const sources: DesktopCapturerSource[] = await desktopCapturer.getSources({ types: ['screen'] });
    const source: DesktopCapturerSource = sources[0];
    // TODO: add a chooser for multiple displays


    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            // @ts-expect-error: chromium-specific WebRTC constraints
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
    await video.play();

    // time delay
    await new Promise(r => setTimeout(r, 50));

    //create canvas, match size to video frame size, copy the frame onto it
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // cleanup: turn off the capture feed after grabbing frame
    video.pause();
    stream.getTracks().forEach(t => t.stop());

    // export JPEG, quality setting
    return canvas.toDataURL('image/jpeg', 0.6)
}

// expose safe API to the webpage(constrains node access)
contextBridge.exposeInMainWorld('api', {
    captureOnce,
    saveImage: (dataUrl: string) => ipcRenderer.invoke('save-image', { dataUrl })
});