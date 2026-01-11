package handlers

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"os"
	"sync"
)

type Config struct {
	AesKey string `json:"aes_key"`
}

var (
	configFile = "config.json"
	config     *Config
	configLock = &sync.RWMutex{}
)

// Initialize with default if not exists
func init() {
	LoadConfig()
}

func LoadConfig() *Config {
	configLock.Lock()
	defer configLock.Unlock()

	// Default Config
	defaultConfig := &Config{
		AesKey: "12345678901234567890123456789012", // Default 32-byte key
	}

	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		config = defaultConfig
		SaveConfigInternal(config)
		return config
	}

	data, err := ioutil.ReadFile(configFile)
	if err != nil {
		config = defaultConfig
		return config
	}

	config = &Config{}
	if err := json.Unmarshal(data, config); err != nil {
		config = defaultConfig
		return config
	}

	return config
}

func SaveConfigInternal(c *Config) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return ioutil.WriteFile(configFile, data, 0644)
}

// HTTP Handlers

func GetConfigHandler(w http.ResponseWriter, r *http.Request) {
	// CORS Headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	configLock.RLock()
	defer configLock.RUnlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

func UpdateConfigHandler(w http.ResponseWriter, r *http.Request) {
	// CORS Headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		return
	}

	var newConfig Config
	if err := json.NewDecoder(r.Body).Decode(&newConfig); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if len(newConfig.AesKey) != 32 {
		http.Error(w, "AES Key must be exactly 32 bytes", http.StatusBadRequest)
		return
	}

	configLock.Lock()
	config = &newConfig
	err := SaveConfigInternal(config)
	configLock.Unlock()

	if err != nil {
		http.Error(w, "Failed to save config", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Configuration saved"})
}
