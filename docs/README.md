# wpa-mcp Documentation

**Status:** Complete  
**Version:** 1.0.0  
**Updated:** 2026-01-14

---

## Goal

This documentation provides a comprehensive reference for the wpa-mcp project - an MCP (Model Context Protocol) server that enables AI agents like Claude to control WiFi connections on Linux systems via wpa_supplicant.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Request                            │
│              "Connect to WiFi network XYZ"                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Client                                 │
│              (Claude Desktop / Claude Code)                     │
│                                                                 │
│  Interprets request, selects appropriate tool                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │     What type of network?     │
              └───────────────┬───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Open/WPA-PSK │     │  WPA2-EAP     │     │   EAP-TLS     │
│               │     │  (Password)   │     │ (Certificate) │
│wifi_connect   │     │wifi_connect_  │     │wifi_connect_  │
│               │     │     eap       │     │     tls       │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    wpa_supplicant                               │
│              Network connection established                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DHCP (dhclient)                             │
│                   IP address acquired                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
              ┌───────────────┴───────────────┐
              │     Captive portal check      │
              └───────────────┬───────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────┐                           ┌───────────────┐
│   No Portal   │                           │ Portal Found  │
│   Connected!  │                           │browser_run_   │
│               │                           │    script     │
└───────────────┘                           └───────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Client                              │
│                  (Claude Desktop / Claude Code)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP POST /mcp
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      src/index.ts                               │
│              Express + StreamableHTTPServerTransport            │
├─────────────────────────────────────────────────────────────────┤
│                      McpServer                                  │
│              (registers tools from src/tools/*)                 │
└───────┬─────────────────────┬─────────────────────┬─────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ src/tools/    │     │ src/tools/    │     │ src/tools/    │
│   wifi.ts     │     │  browser.ts   │     │connectivity.ts│
│credentials.ts │     │               │     │               │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ src/lib/      │     │ src/lib/      │     │ src/lib/      │
│  wpa-cli.ts   │     │ playwright-   │     │ network-      │
│  wpa-daemon.ts│     │  runner.ts    │     │  check.ts     │
│  dhcp-manager │     └───────────────┘     └───────────────┘
│  mac-utils.ts │
│  credential-  │
│    store.ts   │
└───────┬───────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                    System Commands                             │
│  wpa_cli  │  wpa_supplicant  │  dhclient  │  ip  │  openssl  │
└───────────────────────────────────────────────────────────────┘
```

---

## Features

| Category | Tool | Description | Status |
|----------|------|-------------|--------|
| **WiFi Connection** | | | |
| | wifi_connect | Connect to WPA-PSK or open networks | Complete |
| | wifi_connect_eap | Connect to WPA2-Enterprise (PEAP/TTLS) | Complete |
| | wifi_connect_tls | Connect using EAP-TLS certificates | Complete |
| | wifi_disconnect | Disconnect from current network | Complete |
| | wifi_reconnect | Reconnect to saved network | Complete |
| **Network Management** | | | |
| | wifi_scan | Scan for available networks | Complete |
| | wifi_status | Get current connection status | Complete |
| | wifi_list_networks | List saved networks | Complete |
| | wifi_forget | Remove a saved network | Complete |
| **Diagnostics** | | | |
| | wifi_eap_diagnostics | Get EAP authentication state | Complete |
| | wifi_get_debug_logs | Get filtered wpa_supplicant logs | Complete |
| **Connectivity** | | | |
| | network_ping | Ping a host | Complete |
| | network_check_internet | Check internet connectivity | Complete |
| | network_check_captive | Detect captive portal | Complete |
| | network_dns_lookup | Perform DNS lookup | Complete |
| **Browser Automation** | | | |
| | browser_open | Open URL in system browser | Complete |
| | browser_run_script | Execute Playwright script | Complete |
| | browser_list_scripts | List available scripts | Complete |
| **Credential Management** | | | |
| | credential_store | Store EAP-TLS certificates | Complete |
| | credential_get | Retrieve credential metadata | Complete |
| | credential_list | List all credentials | Complete |
| | credential_delete | Delete a credential | Complete |
| **Privacy** | | | |
| | MAC Randomization | Per-connection MAC address control | Complete |
| | Pre-assoc MAC | MAC randomization during scanning | Complete |

---

## Document Index

### Reference Documents

| # | Document | Description |
|---|----------|-------------|
| 00 | [Architecture](./00_Architecture.md) | System architecture and component overview |
| 05 | [Structure and Flow](./05_Structure_and_Flow.md) | Repository structure, layers, and end-to-end request flow |
| 01 | [WiFi Tools](./01_WiFi_Tools.md) | WiFi connection and management tools |
| 02 | [Connectivity Tools](./02_Connectivity_Tools.md) | Network diagnostics and testing |
| 03 | [Browser Tools](./03_Browser_Tools.md) | Browser automation for captive portals |

### Design Documents

| # | Document | Description |
|---|----------|-------------|
| 10 | [EAP-TLS Authentication](./10_EAP-TLS_Design.md) | 802.1X certificate authentication design |
| 11 | [Credential Store](./11_Credential_Store_Design.md) | Certificate storage system design |

---

## Quick Start

### 1. Start the Server

```bash
npm install
npm run build
npm start
# Or use Makefile
make start
```

### 2. Configure MCP Client

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "wpa-mcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### 3. Connect to WiFi

```
User: "Scan for WiFi networks"
User: "Connect to MyNetwork with password <your-password>"
```

---

## Environment Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP server port |
| HOST | 0.0.0.0 | Bind address |
| WIFI_INTERFACE | wlan0 | WiFi interface name |
| WPA_CONFIG_PATH | /etc/wpa_supplicant/wpa_supplicant.conf | wpa_supplicant config |
| WPA_DEBUG_LEVEL | 2 | Debug verbosity (1-3) |

---

## Quick Links

- [Main README](../README.md) - Project overview
- [Source Code](../src/) - Implementation
- [Makefile](../Makefile) - Build and deployment commands
- [Environment Template](../.env.example) - Configuration template
