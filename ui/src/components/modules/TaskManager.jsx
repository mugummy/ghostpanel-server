import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Activity, Trash2, Cpu } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function TaskManager({ agentId }) {
    const [processes, setProcesses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedPid, setSelectedPid] = useState(null);
    const wsRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[TaskMgr] Connected");
            refresh();
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                const decoder = new TextDecoder('utf-8');
                try {
                    const text = decoder.decode(data);
                    if (text.startsWith("PROCS:")) {
                        const jsonStr = text.substring(6);
                        try {
                            const list = JSON.parse(jsonStr);
                            // Sort by PID
                            list.sort((a, b) => a.pid - b.pid);
                            setProcesses(list);
                            setLoading(false);
                        } catch (e) {
                            console.error("JSON Error", e);
                            setLoading(false);
                        }
                    }
                } catch(e) {}
            }
        };

        return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
    }, [agentId]);

    const refresh = () => {
        setLoading(true);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send("__PROC_LS__");
        }
    };

    const killProcess = () => {
        if (!selectedPid) return;
        if (!confirm(`Force kill process ${selectedPid}?`)) return;
        
        if (wsRef.current) {
            wsRef.current.send(`__PROC_KILL__:${selectedPid}`);
            setLoading(true);
            setTimeout(refresh, 1000); // Give it time to die
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 font-mono text-sm relative">
            {/* Toolbar */}
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex items-center gap-2">
                <button onClick={refresh} className="p-1.5 hover:bg-[#333] rounded transition" title="Refresh"><RefreshCw size={16}/></button>
                <div className="h-6 w-px bg-[#333] mx-1"></div>
                <button 
                    onClick={killProcess} 
                    disabled={!selectedPid} 
                    className={`p-1.5 rounded transition ${selectedPid ? 'hover:bg-[#333] text-red-400' : 'text-gray-600 cursor-not-allowed'}`} 
                    title="Kill Process"
                >
                    <Trash2 size={16}/>
                </button>
                <div className="flex-1 ml-2 text-xs text-gray-500 flex items-center gap-2">
                    <Activity size={12}/> Total Processes: <span className="text-white">{processes.length}</span>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto p-2" onClick={() => setSelectedPid(null)}>
                {loading && <div className="text-center text-gray-500 mt-4 animate-pulse">Scanning Processes...</div>}
                
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-gray-500 border-b border-[#333] text-xs uppercase sticky top-0 bg-[#0c0c0c]">
                            <th className="p-2 w-20">PID</th>
                            <th className="p-2">Image Name</th>
                            <th className="p-2 w-20 text-right">Threads</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processes.map((proc) => (
                            <tr 
                                key={proc.pid} 
                                className={`cursor-pointer hover:bg-[#1a1a1a] group ${selectedPid === proc.pid ? 'bg-[#222] text-white' : 'text-gray-400'}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedPid(proc.pid); }}
                            >
                                <td className="p-2 font-mono text-cyan-500">{proc.pid}</td>
                                <td className="p-2 flex items-center gap-2">
                                    <Cpu size={14} className="opacity-50"/>
                                    {proc.name}
                                </td>
                                <td className="p-2 text-right">{proc.threads}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}