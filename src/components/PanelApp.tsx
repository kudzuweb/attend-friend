import { useState, useEffect } from "react";

export default function PanelApp() {
    // llm output
    const [llmText, setLlmText] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    async function askTheLlm() {
        setLoading(true);
        const res = await window.api.analyzeRecent(10);
        if (!res.ok) {
            return setLlmText(`error: ${res.error ?? 'unknown'}`);
            setLoading(false);
            return;
        }
        if (!res.text) {
            console.warn('no text field, raw payload:', res.raw)
        }
        setLlmText(typeof res.text === 'string' ? res.text : JSON.stringify(res.raw ?? res, null, 2));
        setLoading(false);
    }

    return (
        <>
            <div className={'panel-root'}>
                <h2 className={'panel'} style={{ fontWeight: 600 }}>analysis</h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className={'panel'} onClick={askTheLlm}>refresh</button>
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
                    {loading && 'analyzing last 5 minutes…'}
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
