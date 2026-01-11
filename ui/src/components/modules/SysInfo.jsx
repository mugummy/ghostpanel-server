import React, { useState, useEffect } from 'react';
import { Cpu, Activity, Database, Monitor, Globe, Info, Clock, AlertTriangle } from 'lucide-react';
import { API_BASE_URL, WS_BASE_URL } from '../../config';

export default function SysInfo({ agentId }) {
    const [specs, setSpecs] = useState(null);
    const [status, setStatus] = useState({ cpu_usage: 0, ram_usage: 0, active_window: 'Loading...' });
    const [history, setHistory] = useState([]); // For graph

    useEffect(() => {
        // 1. Fetch initial specs from API
        fetch(`${API_BASE_URL}/api/agents`)
            .then(res => res.json())
            .then(list => {
                const me = list.find(a => a.id === agentId);
                if (me && me.specs) {
                    setSpecs(me.specs);
                }
            })
            .catch(err => console.error("Failed to fetch initial specs", err));

        // 2. WebSocket for real-time updates
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        
        ws.onopen = () => {
            console.log("[SysInfo] Connected");
        };

        ws.onmessage = (event) => {
            const msg = event.data;
            if (typeof msg !== 'string') return;

            if (msg.startsWith("SYS_INFO:")) {
                try {
                    const data = JSON.parse(msg.substring(9));
                    setSpecs(data);
                } catch(e) { console.error("SysInfo Parse Error", e); }
            } 
            else if (msg.startsWith("HEARTBEAT:")) {
                try {
                    const data = JSON.parse(msg.substring(10));
                    setStatus(data);
                    
                    // Update Graph Data (Max 50 points)
                    setHistory(prev => {
                        const next = [...prev, { time: new Date().toLocaleTimeString(), cpu: data.cpu_usage, ram: data.ram_usage }];
                        if (next.length > 50) return next.slice(next.length - 50);
                        return next;
                    });
                } catch(e) { console.error("Heartbeat Parse Error", e); }
            }
        };

        return () => ws.close();
    }, [agentId]);

    const SpecCard = ({ icon: Icon, label, value, color }) => (
        <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#333] flex items-center gap-4">
            <div className={`p-3 rounded-full bg-opacity-10 ${color.bg}`}>
                <Icon size={24} className={color.text} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 uppercase font-bold">{label}</div>
                <div className="text-white font-mono break-words text-sm">{value || 'Unknown'}</div>
            </div>
        </div>
    );

    const UsageBar = ({ label, value, color }) => (
        <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between text-xs font-bold text-gray-400">
                <span>{label}</span>
                <span className={color.text}>{value}%</span>
            </div>
            <div className="h-2 bg-[#333] rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-500 ${color.bg_solid}`} 
                    style={{ width: `${value}%` }}
                ></div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 p-6 overflow-y-auto">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#333]">
                <Info size={28} className="text-cyan-400" />
                <h2 className="text-2xl font-bold text-white">System Information</h2>
            </div>

            {/* Top Cards: Static Specs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <SpecCard icon={Monitor} label="PC Name / User" value={specs?.pc_name} color={{ bg: 'bg-blue-500', text: 'text-blue-400' }} />
                <SpecCard icon={Database} label="OS Version" value={specs?.os} color={{ bg: 'bg-purple-500', text: 'text-purple-400' }} />
                <SpecCard icon={Globe} label="Location" value={specs?.country} color={{ bg: 'bg-green-500', text: 'text-green-400' }} />
                <SpecCard icon={Cpu} label="CPU Model" value={specs?.cpu} color={{ bg: 'bg-red-500', text: 'text-red-400' }} />
                <SpecCard icon={Activity} label="GPU Model" value={specs?.gpu} color={{ bg: 'bg-orange-500', text: 'text-orange-400' }} />
                <SpecCard icon={Database} label="Total RAM" value={specs?.ram_total} color={{ bg: 'bg-yellow-500', text: 'text-yellow-400' }} />
            </div>

            {/* Middle: Live Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                
                {/* Live Usage Panel */}
                <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 flex flex-col gap-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Activity size={20} className="text-red-500 animate-pulse" />
                        <h3 className="text-lg font-bold text-white">Real-time Load</h3>
                    </div>

                    <div className="flex flex-col gap-6">
                        <UsageBar label="CPU Usage" value={status.cpu_usage} color={{ text: 'text-red-400', bg_solid: 'bg-red-500' }} />
                        <UsageBar label="RAM Usage" value={status.ram_usage} color={{ text: 'text-yellow-400', bg_solid: 'bg-yellow-500' }} />
                    </div>

                    <div className="mt-auto pt-6 border-t border-[#333]">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                            <Monitor size={14}/> Current Active Window
                        </div>
                        <div className="bg-[#111] p-3 rounded border border-[#333] text-cyan-400 font-mono text-sm truncate">
                            {status.active_window || "Idle"}
                        </div>
                    </div>
                </div>

                {/* Graph Placeholder (Visual only for now) */}
                <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 flex flex-col relative overflow-hidden">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={18} className="text-gray-400"/> Usage History</h3>
                    <div className="flex-1 flex items-end justify-between gap-1 h-64 border-b border-l border-[#333] p-1">
                        {history.map((pt, i) => (
                            <div key={i} className="w-full flex flex-col justify-end gap-0.5 h-full group relative">
                                <div className="bg-red-500/50 w-full rounded-t-sm transition-all duration-300" style={{ height: `${pt.cpu}%` }}></div>
                                <div className="bg-yellow-500/50 w-full rounded-t-sm transition-all duration-300" style={{ height: `${pt.ram}%` }}></div>
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black text-xs text-white p-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none border border-[#333]">
                                    {pt.time} <br/> CPU: {pt.cpu}% <br/> RAM: {pt.ram}%
                                </div>
                            </div>
                        ))}
                        {history.length === 0 && <div className="text-gray-600 self-center w-full text-center">Waiting for heartbeat...</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
