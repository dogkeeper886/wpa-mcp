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

wpa-mcp runs in a Docker container with the WiFi phy device moved into the container's network namespace using `iw phy set netns`. All WiFi routes, DHCP, and IP addresses stay inside the container and never touch the host routing table.

### Prerequisites

- Docker installed on the host
- `iw` installed on the host (`sudo dnf install iw` or `sudo apt install iw`)
- A PCIe or USB WiFi adapter on the host

### Step 1: Find WiFi interface and its phy

```bash
ip link show | grep -E "^[0-9]+: wl"
# e.g. 3: wlp6s0

cat /sys/class/net/wlp6s0/phy80211/name
# e.g. phy0
```

### Step 2: Unmanage from NetworkManager

```bash
sudo make nm-unmanage WIFI_INTERFACE=wlp6s0
# Creates /etc/NetworkManager/conf.d/99-unmanaged-wlp6s0.conf (persistent)
```

### Step 3: Build and start

```bash
make docker-build
sudo make docker-start
```

The start script:
1. Starts the container with Docker bridge networking (port 3000 forwarded)
2. Moves the WiFi phy into the container's network namespace
3. Waits for the server to be healthy
4. The entrypoint deletes the bridge default route so WiFi becomes the sole default

### Step 4: Verify

```bash
# Health check
curl http://localhost:3000/health

# Host: WiFi interface is gone (moved into container)
ip link show wlp6s0          # should fail: does not exist

# Container: WiFi interface is present
docker exec wpa-mcp ip link show wlp6s0
docker exec wpa-mcp ip route
```

### Step 5: Register MCP client

```bash
# Claude Code (from host or any machine that can reach port 3000)
claude mcp add wpa-mcp --transport http http://localhost:3000/mcp
```

### Cleanup

```bash
# Stop container (phy returns to host automatically)
make docker-stop

# Restore NetworkManager management (optional)
sudo make nm-restore WIFI_INTERFACE=wlp6s0
```

See [docs/05_Structure_and_Flow.md](docs/05_Structure_and_Flow.md) for the full netns architecture and route trace.

---

## EAP-TLS Certificates

To use EAP-TLS or Hotspot 2.0, place certificate files in the `certs/` directory before building the Docker image. They are baked into the image and auto-imported on each container startup.

### File naming convention

```
certs/
├── <identity>_crt.pem          # Client certificate (required)
├── <identity>_prv.pem          # Private key (required)
├── radius.*_crt.pem | ca*.pem  # CA certificate (optional)
```

Example for identity `user@example.com`:

```
certs/
├── user@example.com_crt.pem
├── user@example.com_prv.pem
└── ca.pem
```

### Workflow

1. Place PEM files in `certs/`
2. Rebuild the image: `make docker-build`
3. Start the container: `sudo make docker-start`
4. The entrypoint auto-imports certs into the credential store (idempotent)
5. Use `wifi_connect_tls` or `wifi_hs20_connect` to connect

Credentials can also be added at runtime via the `credential_store` MCP tool, but these are ephemeral and lost when the container stops.

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
| `wifi_connect_eap` | Connect to WPA2-Enterprise/802.1X network (PEAP, TTLS) |
| `wifi_connect_tls` | Connect using EAP-TLS with client certificate |
| `wifi_hs20_connect` | Connect to Hotspot 2.0 / Passpoint network |
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

### Credential Management

| Tool | Description |
|------|-------------|
| `credential_store` | Store EAP-TLS client certificate and private key |
| `credential_list` | List stored credentials |
| `credential_get` | Get credential details and certificate info |
| `credential_delete` | Delete a stored credential |

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
| `make docker-build` | Build Docker image |
| `sudo make docker-start` | Start container (moves WiFi phy into container netns) |
| `make docker-stop` | Stop container (WiFi returns to host) |
| `make docker-restart` | Stop then start |
| `make docker-logs` | Follow container logs |
| `make docker-status` | Check container status and health |
| `make docker-shell` | Open bash in running container |
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
