# GhostPanel Deployment Guide

This guide covers how to deploy the **GhostPanel Server** to **Oracle Cloud** or **Google Cloud (GCP)** (Free Tier), or **Self-Host on your PC** (No Credit Card), and the **Dashboard (UI)** to **Vercel**.

---

## Part 1-A: Server Deployment (Oracle Cloud)

Since the server requires persistent storage (for logs and payloads) and raw TCP ports (for agents), a VPS is required. Oracle Cloud Free Tier is an excellent choice for powerful ARM instances.

### 1. VM Setup
1.  Create an **Oracle Cloud Free Tier** account.
2.  Create a **Compute Instance** (VM.Standard.E2.1.Micro or ARM based).
3.  Choose **Ubuntu** or **Oracle Linux** as the image.
4.  Ensure you have SSH access.

### 2. Firewall Configuration (Ingress Rules)
You must allow traffic on ports `8888` (API/WebSocket) and `9000` (TCP Agent Connection).
1.  In Oracle Cloud Dashboard, go to your **VCN** -> **Security Lists**.
2.  Add **Ingress Rules**:
    *   Source CIDR: `0.0.0.0/0`
    *   Protocol: TCP
    *   Destination Port Range: `8888, 9000`
3.  **SSH into your VM** and open ports on the internal firewall (iptables/ufw):
    ```bash
    sudo iptables -I INPUT -p tcp --dport 8888 -j ACCEPT
    sudo iptables -I INPUT -p tcp --dport 9000 -j ACCEPT
    sudo netfilter-persistent save
    ```

### 3. Deploying the Server
(See **Part 1-C: Installation Steps** below for common commands)

---

## Part 1-B: Server Deployment (Google Cloud Platform - GCP)

GCP offers an **"Always Free"** tier which is great for running this lightweight C2 server 24/7.

### 1. VM Setup (Always Free Specs)
1.  Create a **Google Cloud** account and go to **Compute Engine**.
2.  Click **Create Instance**.
3.  **Name:** `ghostpanel-server`
4.  **Region:** Must be **us-central1**, **us-west1**, or **us-east1** (to be eligible for Always Free).
5.  **Machine Type:** `e2-micro`.
6.  **Boot Disk:** Change to **Standard persistent disk** and set size to **30 GB**. (30GB is the free limit).
7.  **OS:** Ubuntu 20.04 LTS or 22.04 LTS.
8.  **Firewall:** Check **Allow HTTP traffic** and **Allow HTTPS traffic**.

### 2. Firewall Configuration (VPC)
By default, GCP blocks custom ports.
1.  Search for **VPC network** -> **Firewall**.
2.  Click **Create Firewall Rule**.
3.  **Name:** `allow-ghostpanel`
4.  **Targets:** All instances in the network.
5.  **Source IPv4 ranges:** `0.0.0.0/0`
6.  **Protocols and ports:** Check **tcp** and enter: `8888, 9000`.
7.  Click **Create**.

### 3. SSH Access
GCP allows one-click SSH from the browser. Click the **SSH** button next to your instance in the list.

---

## Part 1-C: Installation Steps (Cloud VPS)

Once you have SSH access to your VPS (Oracle or GCP):

### 1. Transfer Files
Clone your repository or upload the `server/` folder.
```bash
git clone <YOUR_REPO_URL>
cd GhostPanel/server
```

### 2. Install Docker (Recommended)
```bash
# Update and install Docker
sudo apt-get update
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
```

### 3. Build and Run
```bash
# Build the Docker image
sudo docker build -t ghost-server .

# Run the container in background (Detached)
# Maps host ports 8888/9000 to container
# Mounts logs/output folders to host so data persists
sudo docker run -d \
  -p 8888:8888 -p 9000:9000 \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/output:/app/output \
  --name c2-server \
  --restart always \
  ghost-server
```

### 4. Verify
Check if it's running:
```bash
sudo docker ps
sudo docker logs c2-server
```
You should see: `GhostPanel Server running on :8888 (HTTP) and :9000 (TCP)`

---

## Part 1-D: No Credit Card / Self-Hosting (Windows + Playit.gg)

If you cannot provide a credit card, you can host the server on your own PC and use **Playit.gg** to expose it to the internet securely without port forwarding.

### 1. Run Server Locally
1.  Open CMD/Terminal in `GhostPanel/server`.
2.  Run the server: `go run main.go` (Make sure Go is installed).
    *   Ideally, use Docker Desktop if you have it: `docker build -t ghost-server . && docker run -p 8888:8888 -p 9000:9000 ghost-server`

### 2. Setup Playit.gg
1.  Download **Playit.gg** for Windows (Free).
2.  Run the installer and follow the link to link your account.
3.  **Create Tunnels:**
    *   **Tunnel 1 (For Dashboard):** Add a **Custom TCP** tunnel pointing to `127.0.0.1:8888`.
        *   It will give you an address like: `auto-allocated-ip.playit.gg:12345` -> Use this for **Vercel API URL**.
    *   **Tunnel 2 (For Agents):** Add a **Custom TCP** tunnel pointing to `127.0.0.1:9000`.
        *   It will give you an address like: `agent-ip.playit.gg:54321` -> Use this for **Builder LHOST/LPORT**.


## Part 2: Dashboard Deployment (Vercel)

The UI is a static React app that connects to the server via API/WebSocket.

### 1. Prepare for Vercel
1.  Push your code to **GitHub**.
2.  Log in to **Vercel** and click "Add New Project".
3.  Import your repository.

### 2. Configure Vercel
1.  **Framework Preset:** Vite
2.  **Root Directory:** Select `ui` (Important! The React app is in the `ui` folder).
3.  **Environment Variables**:
    Expand the "Environment Variables" section and add:
    *   `VITE_API_URL`: `http://<SERVER_IP>:<PORT>`
    *   `VITE_WS_URL`: `ws://<SERVER_IP>:<PORT>`
    
    *If using Playit.gg:*
    *   `VITE_API_URL`: `http://auto-allocated-ip.playit.gg:12345`
    *   `VITE_WS_URL`: `ws://auto-allocated-ip.playit.gg:12345`

### 3. Deploy
1.  Click **Deploy**.
2.  Once finished, Vercel will give you a domain (e.g., `ghostpanel.vercel.app`).

---

## Part 3: Agent Configuration

When generating a payload in the **Builder**, use your Server IP or Playit.gg address:

*   **Cloud VPS:**
    *   **LHOST:** `<VPS_IP>`
    *   **LPORT:** `9000`

*   **Playit.gg:**
    *   If Playit gave you `agent-ip.playit.gg:54321`:
    *   **LHOST:** `agent-ip.playit.gg` (You might need to ping this to get the numeric IP if LHOST only accepts IP)
    *   **LPORT:** `54321` (The port allocated by Playit)


## Troubleshooting

*   **Mixed Content Error:** Vercel serves sites via **HTTPS**. If your server IP uses **HTTP** (which Playit and Cloud IPs do), the browser will block it.
    *   **Fix:** When visiting your Vercel dashboard, manually change `https://` to `http://` in the browser address bar. (e.g., `http://ghostpanel.vercel.app`).
    *   Or go to Site Settings -> Insecure Content -> **Allow**.
