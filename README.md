# wpa-mcp

MCP (Model Context Protocol) Server for WiFi control via wpa_supplicant.

This server runs on a remote Linux host and allows Claude/MCP clients to:
- Connect/disconnect WiFi networks
- Scan for available networks
- Check network connectivity and captive portals
- Run Playwright browser automation scripts

## Quick Start

```bash
# 1. Configure deployment
cp .env.example .env
# Edit .env with your remote host details

# 2. First time setup (deploy + install + build on remote)
make setup

# 3. Start server on remote
make start
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server settings
PORT=3000
HOST=0.0.0.0
WIFI_INTERFACE=wlan0

# Deployment
REMOTE_HOST=user@192.168.1.100
REMOTE_DIR=~/wpa-mcp
```

## Deployment (Makefile)

| Command | Description |
|---------|-------------|
| `make setup` | First time: deploy + install + build |
| `make deploy` | Rsync source to remote |
| `make install` | npm install on remote |
| `make build` | npm run build on remote |
| `make start` | Start server on remote |
| `make stop` | Stop server on remote |
| `make restart` | Restart remote server |
| `make logs` | Tail remote logs |
| `make status` | Check if server is running |
| `make clean` | Remove dist/ on remote |

### Development Workflow

```bash
# Make changes locally, then:
make deploy build restart

# Monitor logs:
make logs
```

## Remote Host Setup (Fedora)

Before the server can control WiFi, configure wpa_supplicant on the remote host:

### 1. Disable NetworkManager for WiFi interface

```bash
# Tell NetworkManager to ignore wlan0
sudo nmcli device set wlan0 managed no

# Or permanently via config:
# /etc/NetworkManager/conf.d/99-unmanaged.conf
# [keyfile]
# unmanaged-devices=interface-name:wlan0
```

### 2. Create wpa_supplicant config

```bash
sudo mkdir -p /etc/wpa_supplicant
sudo tee /etc/wpa_supplicant/wpa_supplicant.conf << 'EOF'
ctrl_interface=/var/run/wpa_supplicant
update_config=1
country=US
EOF
sudo chmod 600 /etc/wpa_supplicant/wpa_supplicant.conf
```

### 3. Start wpa_supplicant

```bash
sudo wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf
```

### 4. Install Playwright browser on remote

```bash
npx playwright install chromium
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wpa-mcp": {
      "url": "http://<REMOTE_HOST_IP>:3000/mcp"
    }
  }
}
```

## Available MCP Tools

### WiFi Management

| Tool | Description |
|------|-------------|
| `wifi_scan` | Scan for available WiFi networks |
| `wifi_connect` | Connect to a WiFi network |
| `wifi_disconnect` | Disconnect from current network |
| `wifi_status` | Get current connection status |
| `wifi_list_networks` | List saved networks |
| `wifi_forget` | Remove a saved network |
| `wifi_reconnect` | Reconnect to current network |

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

## Playwright Scripts

Scripts are stored in `~/.config/wpa-mcp/scripts/` on the remote host.

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

## Example Usage

```
User: "Scan for WiFi networks"
Claude: [calls wifi_scan]
→ Lists available networks with signal strength

User: "Connect to 'CoffeeShop' with password 'guest123'"
Claude: [calls wifi_connect with ssid="CoffeeShop", password="guest123"]
→ Connects to the network

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

## API Endpoints

- `POST /mcp` - MCP protocol endpoint (Streamable HTTP)
- `GET /health` - Health check

## License

MIT
