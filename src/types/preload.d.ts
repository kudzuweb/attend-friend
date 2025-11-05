export { };

declare global {
    // screenshot type
    type Screenshot = { dataUrl: string; capturedAt: string };

    // session state type
    type SessionState = {
        isActive: boolean;
        lengthMs: number;
        startTime: number;
        endTime: number;
    };

    // add window.api to Window type so TS doesn't freak out
    interface Window {
        api: {
            getScreenPermissionStatus: () => Promise<
                'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
            >;
            openScreenRecordingSettings: () => Promise<{ ok: boolean; reason?: string }>;
            relaunchApp: () => Promise<void>;
            captureFrames: () => Promise<{ dataUrl: string; capturedAt: string }>;
            saveImage: (payload: { dataUrl: string; capturedAt: string }) => Promise<
                | { ok: true; file: string; deduped: boolean; bytes: number }
                | { ok: false; error: string }
            >;
            getRecentImages(limit?: number): Promise<{ ok: true; files?: string[] } | { ok: false; error: string }>;
            analyzeRecent(limit?: number): Promise<{
                ok: true;
                structured: {
                    status: 'on_task' | 'drifted';
                    analysis: string;
                    suggested_prompt: string;
                };
                raw?: unknown;
                count: number
            } | { ok: false; error: string }>;
            showPanel: (options?: { setupSession?: boolean }) => Promise<void>;
            hidePanel: () => Promise<void>;
            sessionStart: (lengthMs: number) => Promise<{ ok: true } | { ok: false; error: string }>;
            sessionGetState: () => Promise<SessionState>;
            sessionStop: () => Promise<{ ok: true } | { ok: false; error: string }>;
            onSessionUpdated: (callback: (state: SessionState) => void) => void;
            onSessionSetupRequested: (callback: () => void) => void;
        };
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