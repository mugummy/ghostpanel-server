import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, XCircle, User } from 'lucide-react';
import { WS_BASE_URL } from '../../config';

export default function Chat({ agentId }) {
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [adminName, setAdminName] = useState('Admin');
    const [chatActive, setChatActive] = useState(false);
    const wsRef = useRef(null);
    const chatEndRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);
        ws.onclose = () => setConnected(false);

        ws.onmessage = (event) => {
            let msg = "";
            if (event.data instanceof ArrayBuffer) {
                const decoder = new TextDecoder('utf-8');
                msg = decoder.decode(event.data);
            } else if (typeof event.data === 'string') {
                msg = event.data;
            }

            if (msg.startsWith('CHAT:')) {
                const content = msg.substring(5);
                setMessages(prev => [...prev, { sender: 'client', text: content }]);
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
        };
    }, [agentId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const startChat = (e) => {
        e.preventDefault();
        if (!adminName.trim()) return;
        wsRef.current.send(`__CHAT_INIT__:${adminName}`);
        setChatActive(true);
        setMessages([{ sender: 'system', text: `Chat started as "${adminName}"` }]);
    };

    const sendMessage = (e) => {
        e.preventDefault();
        if (!inputText.trim()) return;
        wsRef.current.send(`__CHAT_MSG__:${inputText}`);
        setMessages(prev => [...prev, { sender: 'admin', text: inputText }]);
        setInputText('');
    };

    const endChat = () => {
        wsRef.current.send("__CHAT_EXIT__");
        setChatActive(false);
        setMessages(prev => [...prev, { sender: 'system', text: "Chat ended." }]);
    };

    if (!chatActive) {
        return (
            <div className="flex flex-col h-full bg-[#0c0c0c] items-center justify-center p-6">
                <div className="bg-[#1a1a1a] p-8 rounded-lg border border-[#333] shadow-2xl max-w-md w-full text-center">
                    <MessageSquare size={48} className="mx-auto text-cyan-400 mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Real-time Chat</h2>
                    <p className="text-gray-500 mb-6 text-sm">Open a persistent chat window on the client's screen.</p>
                    
                    <form onSubmit={startChat} className="flex flex-col gap-4 text-left">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Display Name</label>
                            <div className="relative mt-1">
                                <User size={16} className="absolute left-3 top-3 text-gray-500" />
                                <input 
                                    type="text" 
                                    value={adminName} 
                                    onChange={(e) => setAdminName(e.target.value)}
                                    className="w-full bg-[#111] border border-[#333] rounded p-2 pl-9 text-white focus:border-cyan-500 outline-none"
                                    placeholder="e.g. Support"
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={!connected} className="bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-400 border border-cyan-900/50 rounded p-2 font-bold transition disabled:opacity-50 disabled:cursor-not-allowed">
                            Start Session
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] relative">
            {/* Header */}
            <div className="bg-[#1a1a1a] border-b border-[#333] p-3 flex justify-between items-center shadow-md z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-green-500/10 p-2 rounded-full"><MessageSquare size={18} className="text-green-400" /></div>
                    <div>
                        <h3 className="font-bold text-white text-sm">Live Chat</h3>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div><span className="text-xs text-green-500">Active</span></div>
                    </div>
                </div>
                <button onClick={endChat} className="flex items-center gap-2 px-3 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/30 rounded text-xs font-bold transition">
                    <XCircle size={14} /> End Chat
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0c0c0c]">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.sender === 'admin' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}>
                        {msg.sender === 'system' ? (
                            <span className="text-xs text-gray-600 bg-[#111] px-2 py-1 rounded-full border border-[#222]">{msg.text}</span>
                        ) : (
                            <div className={`max-w-[70%] p-3 rounded-lg text-sm shadow-sm ${
                                msg.sender === 'admin' 
                                ? 'bg-cyan-900/20 border border-cyan-900/50 text-cyan-100 rounded-tr-none' 
                                : 'bg-[#222] border border-[#333] text-gray-200 rounded-tl-none'
                            }`}>
                                <div className="text-[10px] opacity-50 mb-1 font-bold uppercase">{msg.sender === 'admin' ? adminName : 'Client'}</div>
                                {msg.text}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={chatEndRef}></div>
            </div>

            {/* Input */}
            <div className="bg-[#1a1a1a] p-3 border-t border-[#333]">
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input 
                        type="text" 
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        className="flex-1 bg-[#111] border border-[#333] rounded p-2 text-white focus:border-cyan-500 outline-none"
                        placeholder="Type a message..."
                        autoFocus
                    />
                    <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded transition">
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
}
