#include "core.h"
#include <stdio.h>

CRITICAL_SECTION g_SocketLock;
SOCKET g_Socket = INVALID_SOCKET;

void SendPacket(unsigned int type, const void* data, int len) {
    if (g_Socket == INVALID_SOCKET) return;

    // Traffic Cop: Only ONE thread can send at a time
    EnterCriticalSection(&g_SocketLock);
    
    PacketHeader hdr = { 0xBEEFCAFE, type, (unsigned int)len };
    
    // Send Header
    int sent = send(g_Socket, (char*)&hdr, sizeof(hdr), 0);
    if (sent <= 0) {
        // Log Error or Reconnect Logic
        LeaveCriticalSection(&g_SocketLock);
        return;
    }

    // Send Body (if any)
    if (len > 0 && data != NULL) {
        int total = 0;
        const char* ptr = (const char*)data;
        while (total < len) {
            sent = send(g_Socket, ptr + total, len - total, 0);
            if (sent <= 0) break;
            total += sent;
        }
    }

    LeaveCriticalSection(&g_SocketLock);
}
