import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Key, AlertTriangle, CheckCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Settings() {
    const [key, setKey] = useState('');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_BASE_URL}/api/config`)
            .then(res => res.json())
            .then(data => {
                setKey(data.aes_key || '');
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setStatus('Failed to load config');
                setLoading(false);
            });
    }, []);

    const handleSave = (e) => {
        e.preventDefault();
        
        if (key.length !== 32) {
            setStatus('Error: Key must be exactly 32 bytes.');
            return;
        }

        fetch(`${API_BASE_URL}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aes_key: key })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok') {
                setStatus('Success: Configuration Saved.');
            } else {
                setStatus('Error: ' + data.message);
            }
        })
        .catch(err => setStatus('Error: Failed to save.'));
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 p-8 items-center justify-center">
            <div className="max-w-2xl w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-purple-500"></div>
                
                <div className="flex items-center gap-4 mb-8 border-b border-[#333] pb-6">
                    <div className="bg-[#222] p-3 rounded-full border border-[#333]">
                        <SettingsIcon className="text-gray-400" size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">System Settings</h2>
                        <p className="text-gray-500 text-sm">Manage global configurations and encryption keys.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-10 text-gray-500 animate-pulse">Loading Configuration...</div>
                ) : (
                    <form onSubmit={handleSave} className="flex flex-col gap-6">
                        
                        {/* Encryption Section */}
                        <div className="bg-[#111] border border-[#333] rounded-md p-6">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Key size={18} className="text-yellow-500"/> Encryption Configuration
                            </h3>
                            
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">AES-256 Key (32 Bytes)</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={key}
                                        onChange={(e) => { setKey(e.target.value); setStatus(''); }}
                                        className={`w-full bg-[#0c0c0c] border rounded p-3 pl-4 text-white font-mono transition focus:outline-none ${key.length === 32 ? 'border-green-900 focus:border-green-500' : 'border-red-900 focus:border-red-500'}`}
                                        placeholder="Enter 32-character key..."
                                    />
                                    <div className={`absolute right-3 top-3.5 text-xs font-bold ${key.length === 32 ? 'text-green-500' : 'text-red-500'}`}>
                                        {key.length}/32
                                    </div>
                                </div>
                                <p className="text-xs text-gray-600 mt-1 flex items-start gap-1">
                                    <AlertTriangle size={12} className="mt-0.5 text-yellow-600"/>
                                    Warning: Changing this key will disconnect all existing agents created with the old key. You must rebuild and redeploy agents after changing this.
                                </p>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={key.length !== 32}
                            className="bg-cyan-900/30 hover:bg-cyan-800/50 text-cyan-400 border border-cyan-900/50 hover:border-cyan-500 rounded p-4 font-bold transition flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Save size={18} className="group-hover:scale-110 transition" />
                            Save Configuration
                        </button>
                    </form>
                )}

                {status && (
                    <div className={`mt-6 text-center text-sm font-bold p-3 rounded flex items-center justify-center gap-2 ${status.startsWith('Error') ? 'bg-red-900/20 text-red-400 border border-red-900/30' : 'bg-green-900/20 text-green-400 border border-green-900/30'}`}>
                        {status.startsWith('Error') ? <AlertTriangle size={16}/> : <CheckCircle size={16}/>}
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}
