// add window.api to Window type so TS doesn't freak out
declare global {
    interface Window {
        api: {
            captureOnce: () => Promise<string>;
            saveImage: (dataUrl: string) => Promise<{ ok: boolean }>;
        }
    }
}


// media track constraints for chromium to allow more granular config
declare global {
    interface MediaTrackConstraintSet {
        // Chromium-only bits used by Electron desktop capture
        chromeMediaSource?: 'desktop' | 'screen' | 'window' | 'tab';
        chromeMediaSourceId?: string;
        mandatory?: {
            chromeMediaSource?: 'desktop' | 'screen' | 'window' | 'tab';
            chromeMediaSourceId?: string;
            maxWidth?: number;
            maxHeight?: number;
            maxFrameRate?: number;
        };
    }
}
export { };