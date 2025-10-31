import { useState, useCallback, useEffect, useRef } from 'react'



function App() {
  // state to hold screenshot, perms status, and timer
  const [img, setImg] = useState<string | null>(null);
  const [showPermModal, setShowPermModal] = useState(false);
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

  // handler functions to open Settings and relaunch
  async function openSettings() {
    const res = await window.api.openScreenRecordingSettings();
    if (!res.ok) {
      console.log("failed to open settings")
    }
  }

  async function relaunch() {
    await window.api.relaunchApp();
  }

  async function askTheLlm() {
    const res = await window.api.analyzeRecent(10);
    if (!res.ok) {
      return console.error('ask llm failed', res.error);
    }
    if (!res.text) {
      console.warn('no text field, raw payload:', res.raw)
    }
    console.log('llm response:', res.text)
  }

  // render react UI, conditionally render img if available
  return (
    <div style={{ padding: 24 }}>
      <h1>attend screenshot demo</h1>

      {img && (
        <div style={{ marginTop: 16 }}>
          <img src={img} alt="screencap" style={{ maxWidth: '100%' }} />
        </div>
      )}

      {/* permissions modal */}
      {showPermModal && (
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
      )}

      <button onClick={askTheLlm}>Analyze last 5 minutes</button>

    </div>
  );

}

export default App
