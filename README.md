# wpa-mcp

**Status:** Complete
**Created:** 2024

---

## Goal

MCP (Model Context Protocol) Server for WiFi control via wpa_supplicant. This server runs on a Linux host and allows Claude/MCP clients to connect/disconnect WiFi networks, scan for available networks, debug connection issues, check connectivity, and automate captive portal logins via Playwright scripts.

---

## Design Flow

### Overview

The server exposes MCP tools that Claude can invoke to manage WiFi connections. It wraps wpa_supplicant commands and provides structured responses.

### Flow Steps

1. **Entry** - MCP client (Claude Desktop/Claude Code) sends tool requests via HTTP POST to `/mcp`
2. **Processing** - Express server routes to StreamableHTTPServerTransport, which dispatches to registered tool handlers
3. **Execution** - Tool handlers invoke wpa_cli commands, run dhclient for DHCP, or execute Playwright scripts
4. **Response** - JSON results returned to MCP client with success/failure status

---

## Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ARCHITECTURE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │         MCP Client              │
                    │  (Claude Desktop / Claude Code) │
                    └───────────────┬─────────────────┘
                                    │ HTTP POST /mcp
                                    ▼
                    ┌─────────────────────────────────┐
                    │      Express + MCP Server       │
                    │        (src/index.ts)           │
                    └───────────────┬─────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│   WiFi Tools      │     │  Browser Tools    │     │ Connectivity Tools│
│  (src/tools/      │     │  (src/tools/      │     │  (src/tools/      │
│   wifi.ts)        │     │   browser.ts)     │     │   connectivity.ts)│
└─────────┬─────────┘     └─────────┬─────────┘     └─────────┬─────────┘
          │                         │                         │
          ▼                         ▼                         ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  wpa-cli.ts       │     │ playwright-       │     │  network-check.ts │
│  wpa-daemon.ts    │     │  runner.ts        │     │  (ping, DNS, HTTP)│
│  dhcp-manager.ts  │     └───────────────────┘     └───────────────────┘
│  mac-utils.ts     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  wpa_supplicant   │
│    (system)       │
└───────────────────┘
```

### Tool Coverage Matrix

```
┌────────────────────┬───────────┬───────────┬───────────────┐
│ Capability         │ WiFi      │ Browser   │ Connectivity  │
├────────────────────┼───────────┼───────────┼───────────────┤
│ Network Scan       │     ✓     │           │               │
│ WPA-PSK Connect    │     ✓     │           │               │
│ WPA2-EAP Connect   │     ✓     │           │               │
│ MAC Randomization  │     ✓     │           │               │
│ Connection Status  │     ✓     │           │               │
│ Debug Logs         │     ✓     │           │               │
│ Captive Portal     │           │     ✓     │       ✓       │
│ Script Automation  │           │     ✓     │               │
│ Ping/DNS           │           │           │       ✓       │
│ Internet Check     │           │           │       ✓       │
└────────────────────┴───────────┴───────────┴───────────────┘
```

---

## Quick Start

```bash
# 1. Install dependencies and build
npm install
npm run build

# 2. Set up wpa_supplicant (see "wpa_supplicant Setup" below)

# 3. Start the server (replace wlan0 with your interface)
WIFI_INTERFACE=wlan0 npm start

# 4. Register with Claude Code (in another terminal)
claude mcp add wpa-mcp --transport http http://localhost:3000/mcp
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
PORT=3000
HOST=0.0.0.0
WIFI_INTERFACE=wlan0
```

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make start` | Start server in background |
| `make stop` | Stop server |
| `make restart` | Restart server |
| `make logs` | Tail log file |
| `make status` | Check if server is running |
| `make clean` | Remove dist/ |

For build/install, use npm directly: `npm install`, `npm run build`, `npm run start`.

---

## wpa_supplicant Setup

Before the server can control WiFi, wpa_supplicant must be configured properly.

### 1. Find your WiFi interface

```bash
ip link show | grep -E "^[0-9]+: wl"
# Example output: 4: wlan0: <BROADCAST,MULTICAST> ...
```

### 2. Disable NetworkManager for WiFi interface (if running)

```bash
# Check if NetworkManager is managing your interface
nmcli device status

# If managed, tell NetworkManager to ignore it
sudo nmcli device set wlan0 managed no

# Or permanently via config:
# /etc/NetworkManager/conf.d/99-unmanaged.conf
# [keyfile]
# unmanaged-devices=interface-name:wlan0
```

### 3. Create wpa_supplicant config

```bash
sudo mkdir -p /etc/wpa_supplicant
sudo tee /etc/wpa_supplicant/wpa_supplicant.conf << 'EOF'
ctrl_interface=/var/run/wpa_supplicant
update_config=1
country=US
EOF
sudo chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf
```

### 4. Start wpa_supplicant

```bash
# Replace wlan0 with your interface name
sudo wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf
```

### 5. Verify wpa_cli works

```bash
wpa_cli -i wlan0 status
# Should show: wpa_state=DISCONNECTED (or COMPLETED if connected)
```

### Troubleshooting wpa_supplicant

**Problem: `wpa_cli` fails with "Failed to connect to non-global ctrl_ifname"**

This means wpa_supplicant is not running with a control interface for your WiFi device. Common causes:

1. **wpa_supplicant running in D-Bus-only mode** (no `-i` flag):
   ```bash
   # Check how it's running
   pgrep -a wpa_supplicant
   # Bad: /usr/sbin/wpa_supplicant -c /etc/wpa_supplicant/wpa_supplicant.conf -u -s
   # Good: /usr/sbin/wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf
   ```

   Fix: Kill and restart with interface flag:
   ```bash
   sudo killall wpa_supplicant
   sudo wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf
   ```

2. **Missing `ctrl_interface` in config**:

   Ensure `/etc/wpa_supplicant/wpa_supplicant.conf` contains:
   ```
   ctrl_interface=/var/run/wpa_supplicant
   ```

3. **Control socket directory doesn't exist**:
   ```bash
   ls -la /var/run/wpa_supplicant/
   # Should show a socket file for your interface
   ```

**Problem: Interface is DOWN**

```bash
sudo ip link set wlan0 up
```

### Install Playwright browser (for browser automation)

```bash
npx playwright install chromium
```

---

## Claude Code Configuration

Register the MCP server with Claude Code:

```bash
claude mcp add wpa-mcp --transport http http://localhost:3000/mcp
```

Then start a new Claude Code session to use the WiFi tools.

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

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
| `browser_run_script` | Run a Playwright automation script |
| `browser_list_scripts` | List available scripts |

### Network Connectivity

| Tool | Description |
|------|-------------|
| `network_ping` | Ping a host |
| `network_check_internet` | Check internet connectivity |
| `network_check_captive` | Detect captive portal |
| `network_dns_lookup` | Perform DNS lookup |

---

## Playwright Scripts

Scripts are stored in `~/.config/wpa-mcp/scripts/`.

### Script Format

```javascript
// ~/.config/wpa-mcp/scripts/my-portal.js
export default async function(page, variables) {
  const { username, password } = variables;

  await page.goto('http://captive-portal.example.com');
  await page.fill('#username', username || '');
  await page.fill('#password', password || '');
  await page.click('button[type="submit"]');

  return 'Login completed';
}
```

### Running Scripts

Via MCP tool:
```
browser_run_script("my-portal", { username: "guest", password: "wifi123" })
```

---

## Example Usage

### Basic WiFi Connection

```
User: "Scan for WiFi networks"
Claude: [calls wifi_scan]
→ Lists available networks with signal strength and security type

User: "Connect to 'CoffeeShop' with password 'guest123'"
Claude: [calls wifi_connect with ssid="CoffeeShop", password="guest123"]
→ Connects to the network
```

### WPA2-Enterprise Connection

```
User: "Connect to corporate WiFi 'CorpNet' with my credentials"
Claude: [calls wifi_connect_eap with ssid="CorpNet", identity="user@corp.com", password="secret"]
→ Connects using PEAP/MSCHAPv2

User: "Connection failed, why?"
Claude: [calls wifi_get_debug_logs with filter="eap"]
→ Shows EAP authentication logs revealing identity rejection or credential failure
```

### Debugging Connection Issues

```
User: "WiFi keeps disconnecting"
Claude: [calls wifi_get_debug_logs with filter="state"]
→ Shows state transitions: COMPLETED -> DISCONNECTED -> SCANNING

User: "Check EAP diagnostics"
Claude: [calls wifi_eap_diagnostics]
→ Returns: eap_state=IDLE, decision=FAIL (server rejected credentials)
```

### Captive Portal Handling

```
User: "Check if there's internet"
Claude: [calls network_check_internet]
→ Reports online status and latency

User: "Check for captive portal"
Claude: [calls network_check_captive]
→ Detects if behind a login page

User: "Run the hotel-login script with room 101"
Claude: [calls browser_run_script with script_name="hotel-login", variables={room: "101"}]
→ Executes Playwright script to handle login
```

---

## Debug Log Filters

The `wifi_get_debug_logs` tool supports these filters to help diagnose specific issues:

| Filter | Use Case | What It Shows |
|--------|----------|---------------|
| `all` | Full debugging | All wpa_supplicant logs |
| `eap` | 802.1X/credential issues | EAP identity, method selection, authentication result |
| `state` | Connection flow | State transitions (SCANNING → AUTHENTICATING → COMPLETED) |
| `scan` | Network discovery | Scan results, BSS information |
| `error` | Failures | Timeouts, authentication failures, TEMP-DISABLED events |

By default, logs are filtered to show only entries since the last WiFi command, making it easy to correlate actions with results.

---

## API Endpoints

- `POST /mcp` - MCP protocol endpoint (Streamable HTTP)
- `GET /health` - Health check

## License

MIT
