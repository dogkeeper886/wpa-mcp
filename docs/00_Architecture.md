# Architecture

**Status:** Complete  
**Updated:** 2026-01-14

---

## Goal

This document describes the system architecture of wpa-mcp, including component responsibilities, data flow, and integration patterns.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Client Layer                             │
│              (Claude Desktop / Claude Code)                     │
│                                                                 │
│  - Interprets user requests                                     │
│  - Selects appropriate MCP tools                                │
│  - Manages conversation context                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP POST /mcp (JSON-RPC)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Transport Layer                              │
│              src/index.ts                                       │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────┐    │
│  │  Express Server │───►│ StreamableHTTPServerTransport   │    │
│  │  Port: 3000     │    │ Handles MCP protocol framing    │    │
│  └─────────────────┘    └─────────────────────────────────┘    │
│                                                                 │
│  Endpoints:                                                     │
│  - POST /mcp      MCP protocol                                  │
│  - GET  /health   Health check                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                             │
│              @modelcontextprotocol/sdk                          │
│                                                                 │
│  - Registers tools with Zod schemas                             │
│  - Validates incoming parameters                                │
│  - Routes requests to handlers                                  │
│  - Formats responses                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  WiFi Tools   │    │Browser Tools  │    │ Connectivity  │
│               │    │               │    │    Tools      │
│ wifi.ts       │    │ browser.ts    │    │connectivity.ts│
│ credentials.ts│    │               │    │               │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  WiFi Libs    │    │ Playwright    │    │ Network Check │
│               │    │   Runner      │    │               │
│ wpa-cli.ts    │    │               │    │ network-      │
│ wpa-daemon.ts │    │ playwright-   │    │   check.ts    │
│ dhcp-manager  │    │   runner.ts   │    │               │
│ mac-utils.ts  │    │               │    │               │
│ credential-   │    │               │    │               │
│   store.ts    │    │               │    │               │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    System Layer                                 │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ wpa_cli  │ │wpa_suppl │ │ dhclient │ │ chromium │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│  │    ip    │ │  openssl │ │   ping   │                        │
│  └──────────┘ └──────────┘ └──────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### Entry Point (src/index.ts)

Main server initialization and lifecycle management.

**Responsibilities:**
- Create Express HTTP server
- Initialize MCP server with transport
- Create WpaDaemon instance (managed wpa_supplicant)
- Create DhcpManager instance
- Register all tools from src/tools/*
- Handle graceful shutdown (SIGTERM, SIGINT)

**Key Objects:**
```typescript
const server = new Server({ name: "wpa-mcp", version: "1.0.0" });
const wpaDaemon = new WpaDaemon(config.interface);
const dhcpManager = new DhcpManager(config.interface);
const wpa = new WpaCli(config.interface);
```

---

### Tool Layer (src/tools/)

MCP tool definitions with Zod validation schemas.

```
src/tools/
├── wifi.ts          WiFi connection and management
├── credentials.ts   EAP-TLS certificate storage
├── browser.ts       Playwright script execution
└── connectivity.ts  Network diagnostics
```

**Tool Registration Pattern:**
```typescript
server.tool(
  "tool_name",
  "Description of what the tool does",
  {
    param1: z.string().describe("Parameter description"),
    param2: z.number().optional().describe("Optional param"),
  },
  async ({ param1, param2 }) => {
    // Implementation
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: false
    };
  }
);
```

---

### Library Layer (src/lib/)

Core implementation classes and utilities.

#### WpaCli (wpa-cli.ts)

Low-level wrapper around `wpa_cli` shell commands.

```
┌─────────────────────────────────────────────────────────────────┐
│                        WpaCli                                   │
├─────────────────────────────────────────────────────────────────┤
│  scan()              Trigger network scan                       │
│  scanResults()       Get scan results                           │
│  connect()           WPA-PSK connection                         │
│  connectEap()        WPA2-Enterprise (PEAP/TTLS)               │
│  connectTls()        EAP-TLS certificate auth                   │
│  disconnect()        Disconnect from network                    │
│  reconnect()         Reconnect to saved network                 │
│  status()            Get connection status                      │
│  listNetworks()      List saved networks                        │
│  removeNetwork()     Forget a network                           │
│  addNetwork()        Create network entry                       │
│  setNetwork()        Configure network parameters               │
│  enableNetwork()     Enable a network                           │
│  selectNetwork()     Select network for connection              │
│  waitForState()      Poll until target state reached            │
│  getEapDiagnostics() Get EAP state info                         │
│  applyMacConfig()    Apply MAC randomization settings           │
└─────────────────────────────────────────────────────────────────┘
```

#### WpaDaemon (wpa-daemon.ts)

Manages wpa_supplicant as a controlled subprocess.

```
┌─────────────────────────────────────────────────────────────────┐
│                      WpaDaemon                                  │
├─────────────────────────────────────────────────────────────────┤
│  start()                  Launch wpa_supplicant                 │
│  stop()                   Graceful shutdown                     │
│  restart()                Stop + Start                          │
│  isRunning()              Check process status                  │
│  getLogFile()             Get log file path                     │
│  getLogsSinceLastCommand() Filtered logs since last op          │
│  getRecentLogs()          Get N recent log lines                │
│  getFilteredLogs()        Filter logs by type                   │
├─────────────────────────────────────────────────────────────────┤
│  Log Filters:                                                   │
│  - eap     EAP/802.1X authentication                            │
│  - state   Connection state transitions                         │
│  - scan    Network discovery                                    │
│  - error   Failures and timeouts                                │
│  - all     All log entries                                      │
└─────────────────────────────────────────────────────────────────┘
```

#### DhcpManager (dhcp-manager.ts)

Manages DHCP client for IP address acquisition.

```
┌─────────────────────────────────────────────────────────────────┐
│                      DhcpManager                                │
├─────────────────────────────────────────────────────────────────┤
│  start(iface, macMode)    Start dhclient                        │
│  stop()                   Stop and release lease                │
│  flushIp()                Remove IP from interface              │
│  waitForIp(timeout)       Poll until IP acquired                │
│  getCurrentIp()           Get current IP address                │
│  isRunning()              Check dhclient status                 │
├─────────────────────────────────────────────────────────────────┤
│  MAC Mode Handling:                                             │
│  - random/persistent-random: Use -lf /dev/null                  │
│    (forces fresh DHCP, prevents old IP request)                 │
└─────────────────────────────────────────────────────────────────┘
```

#### CredentialStore (credential-store.ts)

Persistent storage for EAP-TLS certificates.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CredentialStore                              │
├─────────────────────────────────────────────────────────────────┤
│  store(id, identity, paths, keyPass, desc)                      │
│  get(id)                  Retrieve metadata                     │
│  list()                   List all credentials                  │
│  delete(id)               Remove credential                     │
│  exists(id)               Check if exists                       │
│  getCertInfo(id)          Extract cert metadata                 │
│  getPemContent(id)        Get PEM from stored files             │
├─────────────────────────────────────────────────────────────────┤
│  Storage Location: ~/.config/wpa-mcp/credentials/<id>/          │
│  Files: metadata.json, client.crt, client.key, ca.crt           │
│  Permissions: Directory 0700, Files 0600                        │
└─────────────────────────────────────────────────────────────────┘
```

#### MacUtils (mac-utils.ts)

MAC address validation and wpa_supplicant value conversion.

```
┌─────────────────────────────────────────────────────────────────┐
│                       MacUtils                                  │
├─────────────────────────────────────────────────────────────────┤
│  isValidMacAddress(mac)           Validate format               │
│  normalizeMacAddress(mac)         Convert to lowercase          │
│  macModeToWpaValue(mode, addr)    Convert to wpa_supplicant     │
│  preassocModeToWpaValue(mode)     Convert preassoc mode         │
├─────────────────────────────────────────────────────────────────┤
│  Mode Mappings:                                                 │
│  - device            → 0 (use real MAC)                         │
│  - random            → 1 (new MAC per connection)               │
│  - persistent-random → 2 (same random across reboots)           │
│  - specific          → MAC address string                       │
└─────────────────────────────────────────────────────────────────┘
```

#### NetworkCheck (network-check.ts)

Connectivity diagnostics.

```
┌─────────────────────────────────────────────────────────────────┐
│                     NetworkCheck                                │
├─────────────────────────────────────────────────────────────────┤
│  ping(host, count)        ICMP ping                             │
│  dnsLookupHost(hostname)  DNS resolution                        │
│  checkInternet()          Multi-URL connectivity test           │
│  checkCaptivePortal()     Detect login redirects                │
│  httpGet(url, timeout)    HTTP request helper                   │
├─────────────────────────────────────────────────────────────────┤
│  Internet Check URLs (fallback order):                          │
│  1. https://www.google.com/generate_204                         │
│  2. https://www.cloudflare.com/cdn-cgi/trace                   │
│  3. https://connectivitycheck.gstatic.com/generate_204         │
└─────────────────────────────────────────────────────────────────┘
```

#### PlaywrightRunner (playwright-runner.ts)

Browser automation for captive portal handling.

```
┌─────────────────────────────────────────────────────────────────┐
│                   PlaywrightRunner                              │
├─────────────────────────────────────────────────────────────────┤
│  ensureScriptsDir()       Create scripts directory              │
│  listScripts()            Enumerate available scripts           │
│  runScript(name, vars)    Execute a script                      │
│  getScriptsDirectory()    Get scripts path                      │
├─────────────────────────────────────────────────────────────────┤
│  Scripts Location: ~/.config/wpa-mcp/scripts/                   │
│  Script Format: export default async (page, vars) => {...}      │
│  Browser: Chromium (headless by default)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### WiFi Connection Flow

```
User Request
     │
     ▼
┌─────────────┐
│ wifi.ts     │ ◄── Validate params with Zod
│ Tool Layer  │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ WpaCli      │ ◄── addNetwork()
│             │ ◄── setNetwork() x N
│             │ ◄── applyMacConfig()
│             │ ◄── enableNetwork()
│             │ ◄── selectNetwork()
└─────┬───────┘
      │
      ▼
┌─────────────┐
│wpa_supplicant│ ◄── Performs 802.11 association
│             │ ◄── Performs EAP if enterprise
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ WpaCli      │ ◄── waitForState('COMPLETED')
│             │     (polls status every 500ms)
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ DhcpManager │ ◄── start(interface)
│             │ ◄── waitForIp(30000)
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Response    │ ──► { ssid, ip_address, ... }
└─────────────┘
```

### Credential Storage Flow

```
User Uploads Certs (SCP)
     │
     ▼
┌─────────────────┐
│ /tmp/certs/     │ ◄── client.crt, client.key, ca.crt
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ credential_store│ ◄── Validate files exist
│ Tool            │ ◄── Validate PEM format (openssl)
└─────┬───────────┘
      │
      ▼
┌─────────────────┐
│ CredentialStore │ ◄── Copy to ~/.config/wpa-mcp/credentials/<id>/
│ Library         │ ◄── Set permissions (0600)
│                 │ ◄── Write metadata.json
└─────────────────┘
     │
     ▼
┌─────────────────┐
│ wifi_connect_tls│ ◄── Uses credential_id to load certs
└─────────────────┘
```

---

## Configuration

### Environment Variables

```bash
# Server
PORT=3000                    # HTTP server port
HOST=0.0.0.0                 # Bind address

# WiFi
WIFI_INTERFACE=wlan0         # WiFi interface
WPA_CONFIG_PATH=/etc/wpa_supplicant/wpa_supplicant.conf
WPA_DEBUG_LEVEL=2            # 1=minimal, 2=normal, 3=verbose

# Optional
WPA_MCP_SCRIPTS_DIR=~/.config/wpa-mcp/scripts
```

### File Locations

| Path | Purpose |
|------|---------|
| ~/.config/wpa-mcp/credentials/ | EAP-TLS certificate storage |
| ~/.config/wpa-mcp/scripts/ | Playwright automation scripts |
| /tmp/wpa_supplicant_<iface>.log | wpa_supplicant debug logs |

---

## Security Model

### Privilege Requirements

| Operation | Privilege | Command |
|-----------|-----------|---------|
| wpa_supplicant control | sudo | wpa_cli |
| Start wpa_supplicant | sudo | wpa_supplicant |
| DHCP client | sudo | dhclient |
| IP configuration | sudo | ip addr |

### Credential Security

- Credentials stored in user home directory
- Directory permissions: 0700 (owner only)
- File permissions: 0600 (owner read/write)
- Private key passwords optionally stored

### Input Validation

- All tool parameters validated with Zod schemas
- Certificate files validated with OpenSSL
- MAC addresses validated for format
- IDs validated for safe characters

---

## Error Handling

### Strategy

1. **Fail Fast** - Validate inputs early
2. **Context Rich** - Include what failed and why
3. **Cleanup on Error** - Remove partial network configs
4. **Never Swallow** - Always propagate with context

### Error Response Format

```json
{
  "content": [{
    "type": "text",
    "text": "{\"success\":false,\"error\":\"Connection failed: WRONG_KEY\"}"
  }],
  "isError": true
}
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @modelcontextprotocol/sdk | ^1.12.0 | MCP protocol |
| express | ^4.21.0 | HTTP server |
| zod | ^3.24.0 | Input validation |
| playwright | ^1.49.0 | Browser automation |
| dotenv | ^17.2.3 | Environment config |
| is-online | ^10.0.0 | Internet check |
| open | ^10.1.0 | Browser opening |

---

## Related Documents

- [01_WiFi_Tools.md](./01_WiFi_Tools.md) - WiFi tool reference
- [02_Connectivity_Tools.md](./02_Connectivity_Tools.md) - Network diagnostics
- [03_Browser_Tools.md](./03_Browser_Tools.md) - Browser automation
