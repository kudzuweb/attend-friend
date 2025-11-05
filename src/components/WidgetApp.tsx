import { useState, useCallback, useEffect, useRef } from 'react'
import { WidgetShell } from './widgetshell';

export default function WidgetApp() {
    // state to: 
    // hold screenshot
    const [img, setImg] = useState<string | null>(null);
    // perms status
    const [showPermModal, setShowPermModal] = useState(false);
    // capture timer
    const timerRef = useRef<number | null>(null);
    const capturingRef = useRef(false);

    // capture handler
    const grab = useCallback(async () => {
        // lock to prevent overlapping captures w/o re-render
        if (capturingRef.current) return;
        capturingRef.current = true;

        try {
            // check perms
            const permsStatus = await window.api.getScreenPermissionStatus();
            if (permsStatus !== 'granted') {
                setShowPermModal(true);
                return;
            }
            // capture one frame
            const shot: Screenshot = await window.api.captureFrames();
            setImg(shot.dataUrl);
            // send frame back to main process via IPC(once storage is implemented)
            const res = await window.api.saveImage({
                dataUrl: shot.dataUrl,
                capturedAt: shot.capturedAt,
            });
            if (res.ok) {
                console.log('saved:', res.file, '(deduped:', res.deduped, ', bytes:', res.bytes, ')');
            } else {
                console.error('save failed:', res.error);
            }

        }
        catch (e) {
            console.error('capture error:', e);
        }
        finally {
            capturingRef.current = false;
        }
    }, [])
    // useEffects
    // screenshot capture loop
    useEffect(() => {
        // take screenshot immediately on boot
        void grab();
        // then every 30s
        timerRef.current = window.setInterval(() => {
            void grab();
        }, 30_000);

        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
        };

    }, []);

    // handler function to open settings
    async function openSettings() {
        const res = await window.api.openScreenRecordingSettings();
        if (!res.ok) {
            console.log("failed to open settings")
        }
    }
    //  handler to relaunch
    async function relaunch() {
        await window.api.relaunchApp();
    }

    // create clickable areas inside the draggable area
    type DragStyle = React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
    const noDragBtnStyle: DragStyle = { WebkitAppRegion: 'no-drag' };

    // render react UI, conditionally render img if available
    return (
        <>
            <WidgetShell>
                {/* analyze button for dev/debugging */}
                <button style={noDragBtnStyle} onClick={() => window.api.showPanel()}>
                    open panel
                </button>
            </WidgetShell>

            {/* permissions modal */}
            {
                showPermModal && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.45)',
                            display: 'grid',
                            placeItems: 'center',
                            zIndex: 9999
                        }}>
                        <div
                            style={{
                                width: 480,
                                background: 'white',
                                borderRadius: 12,
                                padding: 20,
                                boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                                color: 'black'
                            }}>
                            <h2 style={{ marginTop: 0 }}>Screen Recording permissions required</h2>
                            <ol style={{ lineHeight: 1.6, paddingLeft: 18 }}>
                                <li> Click <b>Open Settings</b> to jump to "Screen Recording".</li>
                                <li>Enable permissions for Attend in the list.</li>
                                <li>Click <b>I enabled it - Restart</b> to relaunch the app.</li>
                            </ol>
                            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                <button onClick={openSettings}>Open Settings</button>
                                <button onClick={relaunch}>I enabled it - Restart</button>
                                <button onClick={() => setShowPermModal(false)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* display screenshot for dev/debugging */}
            {/* {img && (
        <div style={{ marginTop: 16 }}>
          <img src={img} alt="screencap" style={{ maxWidth: '100%' }} />
        </div>
      )} */}
        </>
    );
}