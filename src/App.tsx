import { useState } from 'react'

function App() {
  // state to hold screenshot and busy status
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPermModal, setShowPermModal] = useState(false);

  // capture handler
  async function grab() {
    try {
      setBusy(true);
      // capture one screen frame
      const dataUrl = await window.api.captureOnce();
      setImg(dataUrl);
      // send frame back to main process via IPC(once storage is implemented)
      // await window.api.saveImage(dataUrl);
    }
    catch (e) {
      console.error(e);
      setShowPermModal(true);
    }
    finally {
      setBusy(false);
    }
  }

  // handler functions to open Settings and relaunch
  async function openSettings() {
    await window.api.openScreenRecordingSettings();
  }

  async function relaunch() {
    await window.api.relaunchApp();
  }

  // render react UI, conditionally render img if available
  return (
    <div style={{ padding: 24 }}>
      <h1>electron screenshot demo</h1>

      <button onClick={grab} disabled={busy}>
        {busy ? 'capturing...' : 'capture once'}
      </button>

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

    </div>
  );

}

export default App
