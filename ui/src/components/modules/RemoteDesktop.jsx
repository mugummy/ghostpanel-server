import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, MousePointer, Keyboard, Volume2, Monitor, Settings, Activity } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function RemoteDesktop({ agentId }) {
    const [imageSrc, setImageSrc] = useState(null);
    const [streaming, setStreaming] = useState(false);
    const [mouseEnabled, setMouseEnabled] = useState(false);
    const [keyboardEnabled, setKeyboardEnabled] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(false);
    const [volume, setVolume] = useState(0.5);
    const [fps, setFps] = useState(30);
    const [quality, setQuality] = useState(70);
    const [monitorList, setMonitorList] = useState([]);
    const [selectedMonitor, setSelectedMonitor] = useState(0);
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedAudioDev, setSelectedAudioDev] = useState(0);
    const [visData, setVisData] = useState(new Uint8Array(10).fill(0));

    const wsRef = useRef(null);
    const imgRef = useRef(null);
    const audioCtxRef = useRef(null);
    const gainNodeRef = useRef(null);
    const nextStartTimeRef = useRef(0);
    const soundEnabledRef = useRef(false);

    useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => ws.send("__LIST_AUDIO_DEVS__");

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                if (data[0] === 0x01) {
                    const blob = new Blob([data.slice(1)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    setImageSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
                } else if (data[0] === 0x02) {
                    if (soundEnabledRef.current) {
                        const audioData = event.data.slice(1);
                        playPcmChunk(audioData);
                        setVisData(new Uint8Array(audioData).slice(0, 10));
                    }
                } else {
                    try {
                        const text = new TextDecoder('utf-8').decode(data);
                        if (text.startsWith("MONITORS:")) {
                            setMonitorList(text.substring(9).split(';').filter(x => x).map(m => {
                                const [id, res] = m.split(':');
                                return { id: parseInt(id), res };
                            }));
                        } else if (text.startsWith("AUDIO_DEVS:")) {
                            setAudioDevices(text.substring(11).split(';').filter(x => x).map(item => {
                                const [type, id, name] = item.split(':');
                                return { type, id: parseInt(id), name };
                            }));
                        }
                    } catch (e) {}
                }
            }
        };
        return () => { if (imageSrc) URL.revokeObjectURL(imageSrc); if (ws.readyState === WebSocket.OPEN) ws.close(); if (audioCtxRef.current) audioCtxRef.current.close(); };
    }, [agentId]);

    const playPcmChunk = (arrayBuffer) => {
        if (!audioCtxRef.current) initAudioContext();
        const ctx = audioCtxRef.current; if (ctx.state === 'suspended') ctx.resume();
        const int16 = new Int16Array(arrayBuffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
        const buffer = ctx.createBuffer(1, float32.length, ctx.sampleRate);
        buffer.copyToChannel(float32, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer; source.connect(gainNodeRef.current);
        const now = ctx.currentTime;
        let startAt = Math.max(now, nextStartTimeRef.current);
        source.start(startAt);
        nextStartTimeRef.current = startAt + buffer.duration;
    };

    const initAudioContext = () => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext({ sampleRate: 48000 });
        const gain = ctx.createGain(); gain.connect(ctx.destination); gain.gain.value = volume;
        audioCtxRef.current = ctx; gainNodeRef.current = gain;
        nextStartTimeRef.current = ctx.currentTime + 0.05;
    };

    const toggleStream = (start) => { setStreaming(start); wsRef.current?.send(start ? "__START_SCREEN__" : "__STOP_SCREEN__"); if (!start) setImageSrc(null); };
    const toggleSound = () => { const s = !soundEnabled; setSoundEnabled(s); if (wsRef.current) wsRef.current.send(s ? `__START_AUDIO_SYS__:${selectedAudioDev}` : "__STOP_AUDIO_SYS__"); };
    const updateConfig = (f, q, m) => { wsRef.current?.send(`__CONFIG__:${f},${q},${m}`); };

    const handleMouse = (e, type) => {
        if (!mouseEnabled || !streaming || !imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const rx = (e.clientX - rect.left) / rect.width;
        const ry = (e.clientY - rect.top) / rect.height;
        let flags = 0;
        if (type === 'down') flags = (e.button === 0) ? 1 : 4;
        if (type === 'up') flags = (e.button === 0) ? 2 : 8;
        wsRef.current.send(`__MOUSE__:${rx.toFixed(4)},${ry.toFixed(4)},${flags}`);
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] relative outline-none" 
             onKeyDown={(e) => keyboardEnabled && streaming && wsRef.current?.send(`__KEY__:${e.keyCode},1`)}
             onKeyUp={(e) => keyboardEnabled && streaming && wsRef.current?.send(`__KEY__:${e.keyCode},0`)}
             tabIndex={0}>
            
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex items-center gap-6 shadow-md z-10 flex-wrap">
                <div className="flex gap-2 border-r border-[#333] pr-6">
                    <button onClick={() => toggleStream(!streaming)} className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${streaming ? 'bg-[#333] text-gray-500' : 'bg-green-900/20 text-green-400 hover:bg-green-500 hover:text-black'}`}>
                        {streaming ? <Square size={12} fill="currentColor"/> : <Play size={12} fill="currentColor"/>}
                        {streaming ? 'STOP STREAM' : 'START STREAM'}
                    </button>
                </div>

                <div className="flex items-center gap-4 border-r border-[#333] pr-6">
                    <button onClick={() => setMouseEnabled(!mouseEnabled)} className={`flex items-center gap-2 px-3 py-1 rounded-sm text-xs font-bold border transition ${mouseEnabled ? 'bg-cyan-900/20 border-cyan-500 text-cyan-400' : 'bg-[#111] border-[#333] text-gray-500 hover:text-gray-300'}`}><MousePointer size={14} /> Mouse</button>
                    <button onClick={() => setKeyboardEnabled(!keyboardEnabled)} className={`flex items-center gap-2 px-3 py-1 rounded-sm text-xs font-bold border transition ${keyboardEnabled ? 'bg-purple-900/20 border-purple-500 text-purple-400' : 'bg-[#111] border-[#333] text-gray-500 hover:text-gray-300'}`}><Keyboard size={14} /> Keyboard</button>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleSound} className={`flex items-center gap-2 px-3 py-1 rounded-sm text-xs font-bold border transition ${soundEnabled ? 'bg-orange-900/20 border-orange-500 text-orange-400' : 'bg-[#111] border-[#333] text-gray-500 hover:text-gray-300'}`}><Volume2 size={14} /> Sound</button>
                        {soundEnabled && (
                            <select value={selectedAudioDev} onChange={(e) => { const v=parseInt(e.target.value); setSelectedAudioDev(v); wsRef.current?.send(`__START_AUDIO_SYS__:${v}`); }} className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] text-orange-400 outline-none max-w-[100px]">
                                {audioDevices.filter(d => d.type === 'P').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                {audioDevices.filter(d => d.type === 'P').length === 0 && <option value="0">Default</option>}
                            </select>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400">
                    <div className="flex items-center gap-2"><span>FPS: <span className="text-cyan-400">{fps}</span></span><input type="range" min="1" max="60" value={fps} onChange={(e) => { const v=parseInt(e.target.value); setFps(v); updateConfig(v, quality, selectedMonitor); }} className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400" /></div>
                    <div className="flex items-center gap-2"><span>Quality:</span><select value={quality} onChange={(e) => { const v=parseInt(e.target.value); setQuality(v); updateConfig(fps, v, selectedMonitor); }} className="bg-[#111] border border-[#333] rounded px-2 py-1 outline-none focus:border-cyan-400"><option value="30">Low</option><option value="50">Med</option><option value="70">High</option><option value="95">Max</option></select></div>
                    <div className="flex items-center gap-2"><span>Monitor:</span><select value={selectedMonitor} onChange={(e) => { const v=parseInt(e.target.value); setSelectedMonitor(v); updateConfig(fps, quality, v); }} className="bg-[#111] border border-[#333] rounded px-2 py-1 outline-none min-w-[80px]"><option value="0">Primary</option>{monitorList.map(m => <option key={m.id} value={m.id}>{m.id}: {m.res}</option>)}</select></div>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center overflow-hidden bg-black relative select-none">
                {imageSrc ? (
                    <img ref={imgRef} src={imageSrc} alt="Stream" className={`max-w-full max-h-full object-contain ${mouseEnabled ? 'cursor-none' : 'cursor-default'}`}
                         onMouseDown={(e) => handleMouse(e, 'down')}
                         onMouseUp={(e) => handleMouse(e, 'up')}
                         onMouseMove={(e) => handleMouse(e, 'move')}
                         onContextMenu={(e) => e.preventDefault()}
                         draggable={false} />
                ) : (
                    <div className="text-gray-700 flex flex-col items-center animate-pulse">
                        <Monitor size={64} className="mb-4 opacity-20" />
                        <p className="text-sm font-mono tracking-widest">WAITING FOR SIGNAL...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
