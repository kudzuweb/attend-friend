import { useState } from 'react'

function App() {
  // state to hold screenshot and busy status
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // capture handler
  async function grab() {
    try {
      setBusy(true);

      // capture one screen frame
      const dataUrl = await window.api.captureOnce();
      setImg(dataUrl);
      // send frame back to main process via IPC
      await window.api.saveImage(dataUrl);
    }
    catch (e) {
      console.error(e);
      alert('screen recording permission is required on macOS.');
    }
    finally {
      setBusy(false);
    }
  }

  // render react UI, conditionally render img if available
  return (
    <div style={{ padding: 24 }}>
      <h1>attend screenshot demo</h1>

      <button onClick={grab} disabled={busy}>
        {busy ? 'capturing...' : 'capture once'}
      </button>

      {img && (
        <div style={{ marginTop: 16 }}>
          <img src={img} alt="screencap" style={{ maxWidth: '100%' }} />
        </div>
      )}

    </div>
  )

}

export default App
