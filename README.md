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
| Browser Automation | Scripted Playwright runner + proxied **Microsoft Playwright MCP** for full step-by-step browser control inside the container's network namespace |

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

The container exposes **two** MCP endpoints on a single port:

| Endpoint | What it is |
|---|---|
| `/mcp` | wpa-mcp itself — WiFi, credentials, connectivity, scripted Playwright |
| `/playwright-mcp` | Proxied [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) — step-by-step browser control, browser runs **inside the container's network namespace** so it reaches captive portals on the WLAN joined via `wifi_connect` |

```bash
# Claude Code (from host or any machine that can reach port 3000)
claude mcp add wpa-mcp         --transport http http://localhost:3000/mcp
claude mcp add wpa-playwright  --transport http http://localhost:3000/playwright-mcp
```

The proxied Playwright MCP advertises its intent via the MCP `instructions` field, so agents registering this endpoint automatically see a "when to pick this server" description. For general browsing on the host's internet, register the stock `@playwright/mcp` separately.

### Cleanup

```bash
# Stop container (phy returns to host automatically)
make docker-stop

# Restore NetworkManager management (optional)
sudo make nm-restore WIFI_INTERFACE=wlp6s0
```

### Auto-start on boot (systemd)

To make wpa-mcp come up automatically on every reboot, install the systemd unit:

```bash
sudo make install-systemd WIFI_INTERFACE=wlp6s0
sudo systemctl enable --now wpa-mcp
```

This installs:

| Path | Purpose |
|------|---------|
| `/usr/local/sbin/wpa-mcp-start` | Wrapper that does `docker run` + `iw phy set netns` + health-wait |
| `/etc/systemd/system/wpa-mcp.service` | `Type=oneshot, RemainAfterExit=yes`, `After=docker.service` |

Uninstall:

```bash
sudo make uninstall-systemd
```

The wrapper script lives in `/usr/local/sbin/` (no dependency on any user home directory), so it works even when `/home` is not yet available at boot.

**Container crash recovery:** The service is `Type=oneshot, RemainAfterExit=yes`, which means systemd tracks the wrapper's exit, not the container itself. If the container dies at runtime (docker daemon crash, OOM kill), systemd will continue to report the unit as `active (exited)` but nothing is running. Recover with:

```bash
sudo systemctl restart wpa-mcp
```

`.env` at the project root is read by `make docker-start` only. The systemd install reads from the `Environment=` lines in `/etc/systemd/system/wpa-mcp.service` — edit that file (and `systemctl daemon-reload`) to change values for the daemon path.

### Persistent credential store

When started via either `make docker-start` or the systemd unit, a Docker named volume `wpa-mcp-data` is mounted at `/home/node/.config/wpa-mcp` inside the container. Credentials added at runtime via the `credential_store` MCP tool persist across container restarts, image rebuilds, and host reboots.

Baked certs under `certs/` are separate: they are copied into the image at build time and re-imported (idempotently) on every container start.

```bash
# Inspect the volume
docker volume inspect wpa-mcp-data

# Wipe stored credentials (container must be stopped first)
sudo systemctl stop wpa-mcp
docker volume rm wpa-mcp-data
```

See [docs/reference/05_Docker_Netns_Isolation.md](docs/reference/05_Docker_Netns_Isolation.md) for the full netns architecture and route trace.

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
claude mcp add wpa-mcp         --transport http http://<HOST_IP>:3000/mcp
claude mcp add wpa-playwright  --transport http http://<HOST_IP>:3000/playwright-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wpa-mcp": {
      "url": "http://<HOST_IP>:3000/mcp"
    },
    "wpa-playwright": {
      "url": "http://<HOST_IP>:3000/playwright-mcp"
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

- `POST /mcp` -- wpa-mcp MCP protocol endpoint (Streamable HTTP, stateless)
- `POST|GET|DELETE /playwright-mcp` -- reverse proxy to the in-container Microsoft Playwright MCP (stateful; Mcp-Session-Id required after initialize)
- `GET /health` -- Health check

---

## Reference

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Full documentation index, user flow, and feature table |
| [docs/reference/00_Architecture.md](docs/reference/00_Architecture.md) | Component architecture and details |
| [docs/reference/05_Docker_Netns_Isolation.md](docs/reference/05_Docker_Netns_Isolation.md) | Docker netns architecture and route trace |
| [docs/reference/01_WiFi_Tools.md](docs/reference/01_WiFi_Tools.md) | WiFi tools reference and debug log filters |
| [docs/reference/03_Browser_Tools.md](docs/reference/03_Browser_Tools.md) | Scripted runner + proxied Playwright MCP |
| [docs/design/13_Dual_MCP_Playwright_Design.md](docs/design/13_Dual_MCP_Playwright_Design.md) | Dual-MCP `/playwright-mcp` proxy design |
| [docs/operations/20_Troubleshooting.md](docs/operations/20_Troubleshooting.md) | Docker and DNS troubleshooting guide |
| [docs/plans/30_Docker_Dev_Plan.md](docs/plans/30_Docker_Dev_Plan.md) | Docker production-readiness roadmap |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## License

MIT
