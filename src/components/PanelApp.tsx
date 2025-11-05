import { useState, useEffect } from "react";

export default function PanelApp() {
    // set interface panel mode
    const [mode, setMode] = useState<'analysis' | 'session'>('analysis');
    // session timer
    const [minutes, setMinutes] = useState(25);
    // llm output
    const [llmText, setLlmText] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // switch modes
    useEffect(() => {
        const unsub = window.api.onPanelMode?.((payload) => {
            setMode(payload.mode);
        });
        return () => {
            unsub?.();
        };
    }, []);

    async function askTheLlm() {
        setLoading(true);

        const res = await window.api.analyzeRecent(10);
        console.log('panelApp res:', res)
        if (!res.ok) {
            return setLlmText(`error: ${res.error ?? 'unknown'}`);
            setLoading(false);
            return;
        }
        if (!res.structured) {
            console.warn('no text field, raw payload:', res.raw)
        }
        setLlmText(res.structured.analysis);
        setLoading(false);
    }

    async function startSession() {
        await window.api.startSession({ minutes });
    }

    if (mode === 'session') {
        return (
            <div className="panel-root">
                <h2 className="panel" style={{ fontWeight: 600 }}>new session</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ color: '#322820' }}>
                        length (minutes):
                        <input
                            type="number"
                            min={1}
                            value={minutes}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                            style={{ marginLeft: 8, width: 80 }}
                        />
                    </label>
                    <button className="panel" onClick={startSession}>start</button>
                    <button className="panel" onClick={() => window.api.hidePanel()}>cancel</button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={'panel-root'}>
                <h2 className={'panel'} style={{ fontWeight: 600 }}>analysis</h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={'panel'} onClick={askTheLlm}>analyze last 5 mins</button>
                        <button className={'panel'} onClick={() => window.api.hidePanel()}>close</button>
                    </div>
                </div>

                <div
                    style={{
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        minHeight: 80,
                        maxHeight: 110,
                        overflowY: 'auto',
                        padding: 6,
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {loading && 'ready to analyze'}
                    {!loading && llmText}
                </div>

                <textarea
                    style={{
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        minHeight: 60,
                        color: '#322820',
                        padding: 6,
                    }}
                    placeholder="what pulled you off-task?"
                />
            </div>
        </>

    );
}
