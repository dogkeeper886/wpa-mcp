# wpa-mcp

MCP (Model Context Protocol) server for WiFi control via wpa_supplicant. Enables Claude and other MCP clients to scan, connect, disconnect, debug, and automate WiFi networks on Linux -- including WPA-PSK, WPA2-Enterprise, EAP-TLS, captive portal handling, and MAC randomization.

---

## Architecture

```
  MCP Client                    wpa-mcp Server                   System
  (Claude Code /                (Express + MCP SDK)
   Claude Desktop)
       │                              │                              │
       │  HTTP POST /mcp              │                              │
       │─────────────────────────────►│                              │
       │                              │  wifi_connect(ssid, psk)     │
       │                              │─────────────────────────────►│ wpa_supplicant
       │                              │                              │ dhclient
       │                              │  { success, ip_address }     │
       │  ◄─────────────────────────  │  ◄───────────────────────────│
       │                              │                              │
```

---

## Features

| Category | Capabilities |
|----------|-------------|
| WiFi Connection | WPA-PSK, WPA2-EAP (PEAP/TTLS), EAP-TLS, open networks, BSSID targeting |
| Network Management | Scan, status, list saved, forget, reconnect |
| Privacy | Per-connection MAC randomization, pre-association MAC |
| Diagnostics | EAP state/decision, filtered debug logs (eap, state, scan, error) |
| Connectivity | Ping, DNS lookup, internet check, captive portal detection |
| Browser Automation | Playwright scripts for captive portal login |

---

## Deployment

wpa-mcp needs a Linux system with a WiFi adapter. There are two approaches depending on your environment.

### Choose Your Approach

| | VM with WiFi Passthrough | Docker with netns Isolation |
|---|---|---|
| WiFi isolation | Full (own VM) | Full (own network namespace) |
| Host route impact | None (separate VM) | None (phy moved into container) |
| Setup complexity | KVM PCI passthrough or USB attach | Docker + `iw` on host |
| Cleanup | Shutdown VM | `docker rm -f wpa-mcp` |
| Best for | Dedicated WiFi testing VM | Host machine with PCIe/USB WiFi |

---

### Approach 1: VM with WiFi Passthrough

Run wpa-mcp directly on a Linux VM (or bare metal) where the WiFi adapter is attached via KVM PCI passthrough or USB device passthrough.

#### Step 1: Attach WiFi adapter to the VM

**PCI passthrough (KVM/libvirt):**

```bash
# On the host, find the WiFi adapter's PCI address
lspci | grep -i wireless
# e.g. 06:00.0 Network controller: Intel Corporation Wi-Fi 6 AX200

# Add to VM XML config (virsh edit <vm>):
# <hostdev mode='subsystem' type='pci'>
#   <source><address domain='0x0000' bus='0x06' slot='0x00' function='0x0'/></source>
# </hostdev>
```

**USB passthrough (KVM/libvirt or VirtualBox):**

```bash
# On the host, find the USB WiFi adapter
lsusb | grep -i wireless
# Pass it through via virt-manager or virsh attach-device
```

After attaching, the WiFi adapter should appear inside the VM.

#### Step 2: Find the WiFi interface

```bash
ip link show | grep -E "^[0-9]+: wl"
# Example: 3: wlp6s0: <BROADCAST,MULTICAST> ...
```

#### Step 3: Unmanage from NetworkManager

If NetworkManager is running, it will interfere with wpa_supplicant. Unmanage the interface:

```bash
# Temporary
sudo nmcli device set wlp6s0 managed no

# Or permanent (recommended)
sudo tee /etc/NetworkManager/conf.d/99-unmanaged-wlp6s0.conf << 'EOF'
[keyfile]
unmanaged-devices=interface-name:wlp6s0
EOF
sudo systemctl restart NetworkManager
```

#### Step 4: Create wpa_supplicant config

```bash
sudo mkdir -p /etc/wpa_supplicant
sudo tee /etc/wpa_supplicant/wpa_supplicant.conf << 'EOF'
ctrl_interface=/var/run/wpa_supplicant
update_config=1
country=US
EOF
sudo chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf
```

#### Step 5: Install and build wpa-mcp

```bash
# Requires Node.js 22+
git clone https://github.com/dogkeeper886/wpa-mcp.git
cd wpa-mcp
npm install
npm run build
```

#### Step 6: Configure environment

```bash
cp .env.example .env
# Edit .env: set WIFI_INTERFACE to your interface name
# WIFI_INTERFACE=wlp6s0
```

#### Step 7: Start the server

```bash
# Foreground
WIFI_INTERFACE=wlp6s0 npm start

# Or background via Makefile
make start
```

#### Step 8: Register MCP client

```bash
# Claude Code
claude mcp add wpa-mcp --transport http http://<VM_IP>:3000/mcp
```

Server is now running. Use `make stop` to stop, `make logs` to tail output.

---

### Approach 2: Docker with Network Namespace Isolation

Run wpa-mcp in a Docker container. The WiFi phy device is moved into the container's network namespace using `iw phy set netns`, so all WiFi routes, DHCP, and IP addresses stay inside the container and never touch the host routing table.

#### Prerequisites

- Docker installed on the host
- `iw` installed on the host (`sudo dnf install iw` or `sudo apt install iw`)
- A PCIe or USB WiFi adapter on the host

#### Step 1: Find WiFi interface and its phy

```bash
ip link show | grep -E "^[0-9]+: wl"
# e.g. 3: wlp6s0

cat /sys/class/net/wlp6s0/phy80211/name
# e.g. phy0
```

#### Step 2: Unmanage from NetworkManager

```bash
sudo make nm-unmanage WIFI_INTERFACE=wlp6s0
# Creates /etc/NetworkManager/conf.d/99-unmanaged-wlp6s0.conf (persistent)
```

#### Step 3: Build the Docker image

```bash
make docker-build
```

#### Step 4: Start container and move WiFi phy

```bash
sudo ./scripts/docker-run.sh wlp6s0
```

This script:
1. Starts the container with Docker bridge networking (port 3000 forwarded)
2. Moves the WiFi phy into the container's network namespace
3. Waits for the server to be healthy
4. The entrypoint deletes the bridge default route so WiFi becomes the sole default

#### Step 5: Verify

```bash
# Health check
curl http://localhost:3000/health

# Host: WiFi interface is gone (moved into container)
ip link show wlp6s0          # should fail: does not exist

# Container: WiFi interface is present
docker exec wpa-mcp ip link show wlp6s0
docker exec wpa-mcp ip route
```

#### Step 6: Register MCP client

```bash
# Claude Code (from host or any machine that can reach port 3000)
claude mcp add wpa-mcp --transport http http://localhost:3000/mcp
```

#### Cleanup

```bash
# Stop container (phy returns to host automatically)
docker rm -f wpa-mcp

# Restore NetworkManager management (optional)
sudo make nm-restore WIFI_INTERFACE=wlp6s0
```

See [docs/05_Structure_and_Flow.md](docs/05_Structure_and_Flow.md) for the full netns architecture and route trace.

---

## MCP Client Configuration

### Claude Code

```bash
claude mcp add wpa-mcp --transport http http://<HOST_IP>:3000/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wpa-mcp": {
      "url": "http://<HOST_IP>:3000/mcp"
    }
  }
}
```

---

## Example Usage

```
User: "Scan for WiFi networks"
Claude: [calls wifi_scan]
→ Lists available networks with signal strength and security type

User: "Connect to 'CoffeeShop' with password 'guest123'"
Claude: [calls wifi_connect with ssid="CoffeeShop", password="guest123"]
→ Connects, acquires IP via DHCP

User: "Connection failed, why?"
Claude: [calls wifi_get_debug_logs with filter="eap"]
→ Shows authentication logs for debugging
```

---

## Available MCP Tools

### WiFi Management

| Tool | Description |
|------|-------------|
| `wifi_scan` | Scan for available networks (returns SSID, signal, security type) |
| `wifi_connect` | Connect to WPA-PSK or open network |
| `wifi_connect_eap` | Connect to WPA2-Enterprise/802.1X network (PEAP, TTLS, TLS) |
| `wifi_disconnect` | Disconnect from current network |
| `wifi_status` | Get connection status (wpa_state, ssid, ip_address, EAP info) |
| `wifi_list_networks` | List saved networks with flags (CURRENT, TEMP-DISABLED) |
| `wifi_forget` | Remove a saved network by network_id |
| `wifi_reconnect` | Reconnect using saved configuration |

### WiFi Diagnostics

| Tool | Description |
|------|-------------|
| `wifi_eap_diagnostics` | Get EAP authentication state and decision |
| `wifi_get_debug_logs` | Get filtered wpa_supplicant logs (eap, state, scan, error) |

### Browser Automation

| Tool | Description |
|------|-------------|
| `browser_open` | Open URL in default browser |
| `browser_run_script` | Run a Playwright automation script for captive portals |
| `browser_list_scripts` | List available scripts in `~/.config/wpa-mcp/scripts/` |

### Network Connectivity

| Tool | Description |
|------|-------------|
| `network_ping` | Ping a host |
| `network_check_internet` | Check internet connectivity |
| `network_check_captive` | Detect captive portal |
| `network_dns_lookup` | Perform DNS lookup |

---

## Environment Variables

Copy `.env.example` to `.env`. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `HOST` | 0.0.0.0 | Bind address |
| `WIFI_INTERFACE` | wlan0 | WiFi interface name |
| `WPA_CONFIG_PATH` | /etc/wpa_supplicant/wpa_supplicant.conf | wpa_supplicant config |
| `WPA_DEBUG_LEVEL` | 2 | Debug verbosity (1-3) |

---

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make start` | Start server in background |
| `make stop` | Stop server |
| `make restart` | Restart server |
| `make logs` | Tail log file |
| `make status` | Check if server is running |
| `make docker-build` | Build Docker image |
| `make test-integration` | Run Docker netns integration test (requires sudo + WiFi) |
| `sudo make nm-unmanage` | Persistently unmanage WiFi interface from NetworkManager |
| `sudo make nm-restore` | Restore NetworkManager management of WiFi interface |

---

## API Endpoints

- `POST /mcp` -- MCP protocol endpoint (Streamable HTTP)
- `GET /health` -- Health check

---

## Reference

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Full documentation index, user flow, and feature table |
| [docs/00_Architecture.md](docs/00_Architecture.md) | Component architecture and details |
| [docs/05_Structure_and_Flow.md](docs/05_Structure_and_Flow.md) | Docker netns architecture and route trace |
| [docs/01_WiFi_Tools.md](docs/01_WiFi_Tools.md) | WiFi tools reference and debug log filters |
| [docs/03_Browser_Tools.md](docs/03_Browser_Tools.md) | Playwright script format and browser automation |
| [docs/20_Troubleshooting.md](docs/20_Troubleshooting.md) | Docker and DNS troubleshooting guide |
| [docs/30_Docker_Dev_Plan.md](docs/30_Docker_Dev_Plan.md) | Docker production-readiness roadmap |

---

## License

MIT
