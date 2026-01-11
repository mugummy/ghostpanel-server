# GhostPanel Project Status
**Last Updated:** Phase 13 Completed
**Role:** Dan (NYC Red Team Specialist)

## Project Overview
**GhostPanel** is a full-stack C2 (Command & Control) framework.
- **Server:** Go (Golang) - Handles TCP agents and WebSocket UI.
- **UI:** React (Vite + Tailwind) - Dashboard for controlling agents.
- **Agent:** C++ (WinAPI, No-CRT) - Lightweight, stealthy payload.

## Implemented Modules

### 1. Core & Networking
- TCP Connection with Custom Protocol.
- WebSocket Broadcasting to UI.
- Builder Module (Compiles Agent with Config).
- Dynamic Settings (AES Key Management via UI).

### 2. Surveillance
- **Terminal:** Reverse Shell (cmd.exe) via WebSocket.
- **Screen:** Real-time Desktop Streaming (JPEG/GDI+).
- **Webcam:** Camera Streaming (DirectShow).
- **Audio:** Microphone & System Audio Loopback (WASAPI/Miniaudio).
- **Keylogger:** Global hook-based keystroke logging.

### 3. System & Control
- **File Manager:** Upload, Download, Delete, Navigate.
- **Task Manager:** List processes, Kill process.
- **System Info:** Real-time CPU/RAM usage, Active Window, Hardware Specs.
- **Open URL:** Opens website in default browser (ShellExecute).
- **Chat:** Unclosable, Always-on-top chat window (Admin <-> Victim).

### 4. Advanced Attack
- **Stealth Execution:** 
  - **PPID Spoofing:** Masquerades as child of `explorer.exe`.
  - **BlockDLLs:** Prevents EDR DLL injection.
  - **RunPE:** Executes 64-bit EXE in memory (Process Hollowing).
  - **Drop & Execute:** Handles non-EXE files by dropping to %TEMP%.

## How to Resume
To resume working on this project with an AI assistant, provide this file content to restore context.

## Next Steps (Potential)
- Phase 14: Persistence (Registry Run Keys, Scheduled Tasks).
- Phase 15: UAC Bypass.
- Phase 16: Pivot / SOCKS5 Proxy.
