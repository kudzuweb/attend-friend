import { useState, useEffect, useRef } from "react";

export default function PanelApp() {
    // refs
    const dialRef = useRef<HTMLDivElement>(null);

    // session state
    const [sessionState, setSessionState] = useState<SessionState | null>(null);
    // session setup state
    const [selectedDuration, setSelectedDuration] = useState<number>(25 * 60 * 1000); // 25 mins default
    const [inSessionSetup, setInSessionSetup] = useState(false);
    // llm output
    const [llmText, setLlmText] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // listen to session state updates and IPC events
    useEffect(() => {
        // Listen for session setup signal from main process
        window.api.onSessionSetupRequested(() => {
            console.log('session setup requested');
            setInSessionSetup(true);
        });

        window.api.onSessionUpdated((state) => {
            setSessionState(state);
            // If panel is open and session just started, we're no longer in setup
            if (state.isActive) {
                setInSessionSetup(false);
            }
        });

        // get initial session state
        window.api.sessionGetState().then(setSessionState).catch(console.error);
    }, []);

    // reset inSessionSetup when panel loads (in case it was set from a previous session)
    useEffect(() => {
        const isPanel = window.location.hash === '#/panel';
        if (isPanel && !inSessionSetup) {
            // Panel just loaded, check if we should be in setup mode
            // The IPC event from main process will set this if needed
            console.log('panel loaded, waiting for setup signal');
        }
    }, []);

    async function handleStartSession() {
        const res = await window.api.sessionStart(selectedDuration);
        if (res.ok) {
            // Panel will close automatically - this is handled via the session state listener
            await window.api.hidePanel();
        } else {
            console.error('Failed to start session:', res.error);
        }
    }

    async function askTheLlm() {
        setLoading(true);

        const res = await window.api.analyzeRecent(10);
        console.log('panelApp res:', res)
        if (!res.ok) {
            setLlmText(`error: ${res.error ?? 'unknown'}`);
            setLoading(false);
            return;
        }
        if (!res.structured) {
            console.warn('no text field, raw payload:', res.raw)
        }
        setLlmText(res.structured.analysis);
        setLoading(false);
    }

    // Determine if we should show session setup
    // Show setup if explicitly in setup mode OR if no session state loaded yet (initial load)
    const showSessionSetup = !sessionState?.isActive && inSessionSetup;

    // Convert selectedDuration (in ms) to minutes for display
    const durationMinutes = selectedDuration / (60 * 1000);

    const handleDurationChange = (minutes: number) => {
        setSelectedDuration(Math.max(1, minutes) * 60 * 1000); // at least 1 minute
    };

    // Set up non-passive wheel listener for the dial
    useEffect(() => {
        const dial = dialRef.current;
        if (!dial) return;

        const handleWheel = (e: WheelEvent) => {
            // Only intercept scroll if cursor is over the dial element
            if (dial.dataset.active === 'true') {
                e.preventDefault();
                const direction = e.deltaY < 0 ? 1 : -1;
                handleDurationChange(Math.max(1, durationMinutes + direction));
            }
        };

        // Add non-passive listener so preventDefault() works
        dial.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            dial.removeEventListener('wheel', handleWheel);
        };
    }, [durationMinutes]);

    return (
        <>
            <div className={'panel-root'}>
                {showSessionSetup ? (
                    // Session setup UI
                    <>
                        <h2 className={'panel'} style={{ fontWeight: 600 }}>new session</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <label style={{ fontSize: 14 }}>duration</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <button
                                        onClick={() => handleDurationChange(Math.max(1, durationMinutes - 1))}
                                        style={{
                                            width: 40,
                                            height: 40,
                                            fontSize: 20,
                                            background: 'rgba(0,0,0,0.2)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            color: 'inherit',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        −
                                    </button>
                                    <div
                                        ref={dialRef}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.dataset.active = 'true';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.dataset.active = 'false';
                                        }}
                                        style={{
                                            minWidth: 80,
                                            textAlign: 'center',
                                            fontSize: 32,
                                            fontWeight: 600,
                                            cursor: 'ns-resize',
                                        }}
                                    >
                                        {Math.round(durationMinutes)}
                                    </div>
                                    <button
                                        onClick={() => handleDurationChange(durationMinutes + 1)}
                                        style={{
                                            width: 40,
                                            height: 40,
                                            fontSize: 20,
                                            background: 'rgba(0,0,0,0.2)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 6,
                                            cursor: 'pointer',
                                            color: 'inherit',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        +
                                    </button>
                                </div>
                                <span style={{ fontSize: 12, opacity: 0.7 }}>minutes</span>
                            </div>
                            <button
                                className={'panel'}
                                onClick={handleStartSession}
                                style={{
                                    background: '#8B7355',
                                    border: 'none',
                                    padding: '10px 16px',
                                    borderRadius: 6,
                                    color: 'white',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    marginTop: 8,
                                }}
                            >
                                start session
                            </button>
                            <button
                                className={'panel'}
                                onClick={() => window.api.hidePanel()}
                                style={{
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    padding: '8px 16px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                }}
                            >
                                cancel
                            </button>
                        </div>
                    </>
                ) : (
                    // Analysis UI
                    <>
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
                    </>
                )}
            </div>
        </>

    );
}
