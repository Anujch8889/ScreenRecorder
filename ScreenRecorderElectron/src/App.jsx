import React, { useState, useRef, useEffect } from 'react';
const { ipcRenderer } = window.require ? window.require('electron') : { ipcRenderer: { invoke: () => { }, on: () => { }, removeAllListeners: () => { } } };

// ------------- CAMERA BUBBLE COMPONENT -------------
const CameraBubble = () => {
    const videoRef = useRef(null);

    useEffect(() => {
        // Force body to be transparent for this window to avoid black corners
        document.body.style.backgroundColor = 'transparent';
        document.body.style.background = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (videoRef.current) videoRef.current.srcObject = stream;
            } catch (err) {
                console.error("Camera Bubble Error:", err);
            }
        };
        startCamera();
    }, []);

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            borderRadius: '50%',
            overflow: 'hidden',
            border: '5px solid #333', // Light black border
            boxSizing: 'border-box',  // Fixes border cutting issue
            WebkitAppRegion: 'drag',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'black'
        }}>
            <video
                ref={videoRef}
                autoPlay
                muted
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)'
                }}
            />
        </div>
    );
};

// ------------- CURSOR OVERLAY COMPONENT -------------
const CursorOverlay = () => {
    const [pos, setPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        // Force body to be transparent for this window
        document.body.style.backgroundColor = 'transparent';
        document.body.style.background = 'transparent';
        document.documentElement.style.backgroundColor = 'transparent';

        ipcRenderer.on('cursor-move', (event, point) => {
            setPos(point);
        });
        return () => {
            ipcRenderer.removeAllListeners('cursor-move');
        };
    }, []);

    return (
        <div style={{
            position: 'absolute',
            left: pos.x - 20,
            top: pos.y - 20,
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 235, 59, 0.6)',
            boxShadow: '0 0 10px rgba(255, 235, 59, 0.8)',
            pointerEvents: 'none',
            transition: 'top 0.05s linear, left 0.05s linear'
        }} />
    );
};

// ------------- MAIN RECORDER COMPONENT -------------
function MainApp() {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const [screenStream, setScreenStream] = useState(null);
    const [hasPermissions, setHasPermissions] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [permissionBlocked, setPermissionBlocked] = useState(false);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedMic, setSelectedMic] = useState('');
    const [videoQuality, setVideoQuality] = useState('1080'); // '1080', '720'
    const [enableHighlighter, setEnableHighlighter] = useState(false);

    const canvasRef = useRef(null);
    const videoRef = useRef(null); // Hidden video for screen stream
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const stateRef = useRef({ isRecording, isPaused, countdown });

    // Animation Loop for Canvas Preview
    useEffect(() => {
        let animationFrameId;
        const draw = () => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (canvas && ctx) {
                if (videoRef.current && videoRef.current.readyState === 4) {
                    // Resize canvas to match video stream if needed, or keep fixed
                    // canvas.width = videoRef.current.videoWidth; 
                    // canvas.height = videoRef.current.videoHeight;
                    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                } else {
                    ctx.fillStyle = '#111';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Draw "Ready" text if no stream
                    if (!screenStream) {
                        ctx.fillStyle = '#555';
                        ctx.font = '30px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText("Ready to Record", canvas.width / 2, canvas.height / 2);
                    }
                }
            }
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(animationFrameId);
    }, [screenStream]);

    useEffect(() => {
        stateRef.current = { isRecording, isPaused, countdown };
    }, [isRecording, isPaused, countdown]);

    useEffect(() => {
        checkPermissions();
        getAudioDevices();

        const handleStartStop = () => {
            if (stateRef.current.countdown) return;
            if (stateRef.current.isRecording) stopRecordingRef();
            else triggerStartRef();
        };

        const handlePauseResume = () => {
            if (stateRef.current.isRecording) togglePauseRef();
        };

        ipcRenderer.on('hotkey-start-stop', handleStartStop);
        ipcRenderer.on('hotkey-pause-resume', handlePauseResume);

        return () => {
            ipcRenderer.removeAllListeners('hotkey-start-stop');
            ipcRenderer.removeAllListeners('hotkey-pause-resume');
        };
    }, []);

    // DOM-based execution for reliable ref access
    const stopRecordingRef = () => document.getElementById('stop-btn')?.click();
    const triggerStartRef = () => document.getElementById('start-btn')?.click();
    const togglePauseRef = () => document.getElementById('pause-btn')?.click();

    const getAudioDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            setAudioDevices(mics);
            if (mics.length > 0) setSelectedMic(mics[0].deviceId);
        } catch (e) { console.error("Error enumerating devices:", e); }
    };

    const checkPermissions = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach(t => t.stop());
            setHasPermissions(true);
        } catch (e) {
            setHasPermissions(false);
        }
    };

    const [permissionBlocked, setPermissionBlocked] = useState(false);

    const requestPermissions = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            stream.getTracks().forEach(t => t.stop());
            setHasPermissions(true);
            setPermissionBlocked(false);
            getAudioDevices(); // Refresh devices after permission
        } catch (err) {
            console.error(err);
            // Check for System Block (Windows 10/11 Privacy Setting)
            if (err.name === 'NotAllowedError' || err.message.includes('Permission denied')) {
                setPermissionBlocked(true);
                // alert("Access Denied..."); // Removed alert to use UI instead
            } else {
                alert("Permission Error: " + err.message);
            }
        }
    };

    const triggerStart = async () => {
        if (!hasPermissions) {
            alert("Please allow permissions first.");
            return;
        }

        const sources = await ipcRenderer.invoke('get-sources');
        if (sources.length === 0) return;
        const primarySource = sources[0];

        try {
            // Apply Quality Settings
            const width = videoQuality === '1080' ? 1920 : 1280;
            const height = videoQuality === '1080' ? 1080 : 720;

            const sStream = await navigator.mediaDevices.getUserMedia({
                audio: { mandatory: { chromeMediaSource: 'desktop' } },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: primarySource.id,
                        maxWidth: width,
                        maxHeight: height
                    }
                }
            });
            setScreenStream(sStream);
            if (videoRef.current) {
                videoRef.current.srcObject = sStream;
                // videoRef.current.play(); // AutoPlay is on
            }

            let count = 3;
            setCountdown(count);
            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    setCountdown(count);
                } else {
                    clearInterval(timer);
                    setCountdown(null);
                    startRecordingActual(sStream);
                }
            }, 1000);

        } catch (err) {
            alert("Failed to get screen: " + err.message);
        }
    };

    const startRecordingActual = async (screenStreamArg) => {
        let micStream;
        try {
            // Use Selected Mic
            const constraints = {
                audio: { deviceId: selectedMic ? { exact: selectedMic } : undefined },
                video: false
            };
            micStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) { console.warn("No Mic"); }

        const audioTracks = [...screenStreamArg.getAudioTracks()];
        if (micStream) audioTracks.push(...micStream.getAudioTracks());

        const audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();

        if (audioTracks.length > 0) {
            audioTracks.forEach(track => {
                if (track.readyState === 'live') {
                    const src = audioContext.createMediaStreamSource(new MediaStream([track]));
                    src.connect(dest);
                }
            });
        }

        // Use Canvas Stream if likely (Wait, we want to record the SCREEN stream directly usually for performance)
        // BUT if we want to add overlay later, canvas is better. 
        // For now, let's record the Screen Stream directly to avoid performance hit of canvas capture, 
        // UNLESS the user wants the "Preview" to be the source.
        // Actually, recording the canvas is expensive (re-encoding). Recording the raw MediaStream is efficient.
        // Since we are not doing layout composition (Camera is separate window), we can just record the streams.

        const finalStream = new MediaStream([
            ...screenStreamArg.getVideoTracks(),
            ...dest.stream.getAudioTracks()
        ]);

        const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm; codecs=vp9';
        const recorder = new MediaRecorder(finalStream, { mimeType });

        mediaRecorderRef.current = recorder;
        recordedChunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            const Buffer = window.require('buffer').Buffer;
            const buffer = Buffer.from(await blob.arrayBuffer());
            await ipcRenderer.invoke('save-video', buffer, 'mp4');

            // Cleanup Cursor
            ipcRenderer.invoke('hide-cursor');
        };

        recorder.start();
        setIsRecording(true);
        setIsPaused(false);

        ipcRenderer.invoke('show-camera');
        if (enableHighlighter) {
            ipcRenderer.invoke('show-cursor');
        }

        setTimeout(() => ipcRenderer.invoke('minimize-window'), 200);
    };

    const togglePause = () => {
        if (!mediaRecorderRef.current) return;
        if (isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
        } else {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
        setIsRecording(false);
        setIsPaused(false);
        setRecordingDuration(0);

        ipcRenderer.invoke('hide-camera');

        // Stop all tracks
        [screenStream, videoRef.current?.srcObject].forEach(stream => {
            stream?.getTracks().forEach(t => t.stop());
        });
        setScreenStream(null);
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    useEffect(() => {
        let interval;
        if (isRecording && !isPaused) {
            interval = setInterval(() => setRecordingDuration(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [isRecording, isPaused]);

    const formatTime = (s) => new Date(s * 1000).toISOString().substr(14, 5);

    if (!hasPermissions) {
        return (
            <div className="permission-screen" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a1a', color: 'white', textAlign: 'center', padding: '20px'
            }}>
                <h1>👋 Permissions Needed</h1>

                {permissionBlocked ? (
                    <div style={{ maxWidth: '500px', background: '#331111', padding: '20px', borderRadius: '10px', border: '1px solid red', marginTop: '20px' }}>
                        <h3 style={{ color: '#ff4444', marginTop: 0 }}>🚫 Access Blocked by Windows</h3>
                        <p style={{ color: '#ccc', fontSize: '14px' }}>
                            Your Windows Privacy Settings are blocking the camera.
                        </p>
                        <button onClick={() => ipcRenderer.invoke('open-win-settings')} style={{
                            padding: '10px 20px', fontSize: '16px', background: '#444', border: '1px solid #777', color: 'white', borderRadius: '5px', cursor: 'pointer', marginTop: '10px'
                        }}>
                            🔧 Open Windows Camera Settings
                        </button>
                        <p style={{ color: '#888', fontSize: '12px', marginTop: '10px' }}>
                            (Turn ON: "Allow desktop apps to access your camera")
                        </p>
                    </div>
                ) : (
                    <p style={{ color: '#aaa', maxWidth: '400px', margin: '10px 0' }}>
                        We need access to your Camera and Microphone to record.
                    </p>
                )}

                <button onClick={requestPermissions} style={{
                    padding: '12px 30px', fontSize: '18px', background: 'linear-gradient(45deg, #ff4b1f, #ff9068)',
                    border: 'none', borderRadius: '25px', color: 'white', marginTop: '30px', cursor: 'pointer', fontWeight: 'bold'
                }}>
                    {permissionBlocked ? "🔄 Retry After Fixing" : "✅ Allow Access"}
                </button>
            </div>
        )
    }

    return (
        <div className="app">
            {countdown && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.8)', color: 'white', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '15rem', zIndex: 9999,
                    fontFamily: 'sans-serif', fontWeight: 'bold'
                }}>
                    {countdown}
                </div>
            )}

            {/* Hidden Source Video for Preview */}
            <video ref={videoRef} autoPlay muted style={{ display: 'none' }} />

            <div className={`controls ${isRecording ? 'recording-active' : ''}`} style={{ flexDirection: 'column', gap: '20px', minWidth: '400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <h2 style={{ color: 'white', margin: 0 }}>Pro Recorder</h2>
                    {!isRecording && (
                        <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                            ⚙️
                        </button>
                    )}
                </div>

                {/* PREVIEW CANVAS */}
                <div style={{
                    width: '100%', height: '200px', background: '#000', borderRadius: '10px',
                    overflow: 'hidden', marginBottom: '15px', border: '2px solid #333'
                }}>
                    <canvas
                        ref={canvasRef}
                        width={1280} // Internal resolution
                        height={720}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                </div>

                {/* SETTINGS PANEL */}
                {showSettings && !isRecording && (
                    <div style={{
                        background: 'rgba(255,255,255,0.1)', padding: '15px', borderRadius: '10px',
                        display: 'flex', flexDirection: 'column', gap: '10px', width: '100%',
                        backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <div>
                            <label style={{ color: '#ccc', display: 'block', marginBottom: '5px' }}>Microphone</label>
                            <select
                                value={selectedMic}
                                onChange={(e) => setSelectedMic(e.target.value)}
                                style={{ width: '100%', padding: '8px', borderRadius: '5px', background: '#222', color: 'white', border: '1px solid #444' }}
                            >
                                {audioDevices.map(device => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ color: '#ccc', display: 'block', marginBottom: '5px' }}>Video Quality</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => setVideoQuality('1080')}
                                    style={{
                                        flex: 1, padding: '8px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                                        background: videoQuality === '1080' ? '#ff4b1f' : '#333', color: 'white'
                                    }}
                                >1080p (High)</button>
                                <button
                                    onClick={() => setVideoQuality('720')}
                                    style={{
                                        flex: 1, padding: '8px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                                        background: videoQuality === '720' ? '#ff4b1f' : '#333', color: 'white'
                                    }}
                                >720p (Low)</button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ color: '#ccc' }}>Mouse Highlighter 🟡</label>
                            <input
                                type="checkbox"
                                checked={enableHighlighter}
                                onChange={(e) => setEnableHighlighter(e.target.checked)}
                                style={{ transform: 'scale(1.5)', cursor: 'pointer' }}
                            />
                        </div>
                    </div>
                )}

                {!screenStream ? (
                    <button id="start-btn" className="btn-primary" onClick={triggerStart} style={{ width: '100%' }}>
                        🔴 Start Recording (F9)
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '15px' }}>
                        <button id="stop-btn" className="btn-stop" onClick={stopRecording}>
                            ⏹ Stop (F9)
                        </button>
                        <button id="pause-btn" className="btn-primary" onClick={togglePause} style={{ background: isPaused ? '#ffa500' : '#444' }}>
                            {isPaused ? "▶ Resume (F10)" : "⏸ Pause (F10)"}
                        </button>
                    </div>
                )}

                {isRecording && <div className="status-indicator">
                    <span className={`dot ${isPaused ? '' : 'blink'}`} style={{ background: isPaused ? 'orange' : 'red' }}></span>
                    {isPaused ? "Paused" : "Recording..."} {formatTime(recordingDuration)}
                </div>}
            </div>
        </div>
    );
}

// ------------- ROUTER (HASH BASED) -------------
export default function App() {
    const [route, setRoute] = useState(window.location.hash);

    useEffect(() => {
        const onHashChange = () => setRoute(window.location.hash);
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    if (route === '#camera') return <CameraBubble />;
    if (route === '#cursor') return <CursorOverlay />; // Add Cursor Route
    return <MainApp />;
}
