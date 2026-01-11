import React, { useState, useEffect, useRef } from 'react';
import { Globe, ExternalLink, Send } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function OpenUrl({ agentId }) {
    const [url, setUrl] = useState('https://');
    const [status, setStatus] = useState('');
    const wsRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[OpenUrl] Connected");
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [agentId]);

    const handleOpen = (e) => {
        e.preventDefault();
        if (!url) return;
        
        // Ensure protocol
        let finalUrl = url;
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(`__OPEN_URL__:${finalUrl}`);
            setStatus(`Sent: ${finalUrl}`);
            setTimeout(() => setStatus(''), 3000);
        } else {
            setStatus('Error: Not Connected');
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 p-8 items-center justify-center">
            <div className="max-w-md w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-6 border-b border-[#333] pb-4">
                    <Globe className="text-cyan-400" size={24} />
                    <h2 className="text-xl font-bold text-white">Open Remote URL</h2>
                </div>

                <form onSubmit={handleOpen} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Target URL</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                className="w-full bg-[#111] border border-[#333] rounded p-3 pl-10 text-white focus:border-cyan-500 focus:outline-none transition font-mono"
                                placeholder="https://example.com"
                            />
                            <ExternalLink size={16} className="absolute left-3 top-3.5 text-gray-500" />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        className="bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-400 border border-cyan-900/50 hover:border-cyan-500 rounded p-3 font-bold transition flex items-center justify-center gap-2 group"
                    >
                        <Send size={18} className="group-hover:translate-x-1 transition" />
                        Open in Default Browser
                    </button>
                </form>

                {status && (
                    <div className={`mt-4 text-center text-sm font-mono p-2 rounded ${status.startsWith('Error') ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
                        {status}
                    </div>
                )}

                <div className="mt-6 text-xs text-gray-600 border-t border-[#333] pt-4">
                    <p>Note: This will launch the default web browser on the target machine with the specified URL visible to the user (SW_SHOWNORMAL).</p>
                </div>
            </div>
        </div>
    );
}
