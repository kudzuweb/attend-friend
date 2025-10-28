declare global {
    // add window.api to Window type so TS doesn't freak out
    interface Window {
        api: {
            openScreenRecordingSettings: () => Promise<{ ok: boolean; reason?: string }>;
            relaunchApp: () => Promise<void>;
            captureOnce: () => Promise<string>;
            saveImage: (dataUrl: string) => Promise<{ ok: boolean }>;
        }
    }
    // media track constraints for chromium to allow more granular config
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