# wpa-mcp Documentation

**Status:** Complete  
**Version:** 2.0.0  
**Updated:** 2026-04-23

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

One external port (3000) fronts two MCP endpoints: `/mcp` (wpa-mcp itself)
and `/playwright-mcp` (reverse-proxied Microsoft Playwright MCP running
inside the container's network namespace so its browser reaches captive
portals on the WLAN joined via `wifi_connect`). Full design:
[13_Dual_MCP_Playwright_Design](./design/13_Dual_MCP_Playwright_Design.md).

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Client                              │
│                  (Claude Desktop / Claude Code)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (single port: 3000)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      src/index.ts  (Express)                    │
│                                                                 │
│  ┌───────────┐  ┌────────────────────┐  ┌───────────────────┐  │
│  │ POST /mcp │  │ POST/GET/DELETE    │  │     /health       │  │
│  │ in-proc   │  │  /playwright-mcp   │  │                   │  │
│  │ McpServer │  │  reverse proxy →   │  │                   │  │
│  └────┬──────┘  │  @playwright/mcp   │  └───────────────────┘  │
│       │         │  (loopback :8931)  │                         │
│       │         └────────────────────┘                         │
│       ▼                                                        │
│   tools from src/tools/*                                       │
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
| | wifi_hs20_connect | Connect to Hotspot 2.0 / Passpoint network | Complete |
| | wifi_disconnect | Disconnect from current network | Complete |
| | wifi_reconnect | Reconnect to saved network | Complete |
| **Network Management** | | | |
| | wifi_scan | Scan for available networks (paginates BSS ids, no truncation in dense RF) | Complete |
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
| | browser_run_script | Execute Playwright script (scripted runner) | Complete |
| | browser_list_scripts | List available scripts | Complete |
| | `/playwright-mcp` endpoint | Proxied Microsoft Playwright MCP for step-by-step browser control inside the container's netns (captive portals / WISPr) | Complete |
| **Credential Management** | | | |
| | credential_store | Store EAP-TLS certificates | Complete |
| | credential_get | Retrieve credential metadata | Complete |
| | credential_list | List all credentials | Complete |
| | credential_delete | Delete a credential | Complete |
| | Persistent credential volume | `wpa-mcp-data` named volume survives container restarts | Complete |
| | Baked cert auto-import | Certs in `certs/` baked into image, re-imported on every start | Complete |
| **Privacy** | | | |
| | MAC Randomization | Per-connection MAC address control | Complete |
| | Pre-assoc MAC | MAC randomization during scanning | Complete |
| | Permanent MAC restore (Docker) | `mac_mode=device` uses real hardware MAC after `iw phy set netns` | Complete |
| **Docker** | | | |
| | Network Namespace Isolation | WiFi phy moved into container netns | Complete |
| | Entrypoint Route Cleanup | Automatic bridge default route deletion | Complete |
| | NM Unmanage Automation | Persistent NetworkManager unmanage via Makefile | Complete |
| | systemd daemon | `sudo make install-systemd` for auto-start on boot | Complete |
| | Integration Test | Full lifecycle test (18/18 pass) | Complete |

---

## Document Index

### Reference Documents

| # | Document | Description |
|---|----------|-------------|
| 00 | [Architecture](./reference/00_Architecture.md) | System architecture and component overview |
| 05 | [Docker Netns Isolation](./reference/05_Docker_Netns_Isolation.md) | Docker network namespace isolation for WiFi |
| 01 | [WiFi Tools](./reference/01_WiFi_Tools.md) | WiFi connection and management tools |
| 02 | [Connectivity Tools](./reference/02_Connectivity_Tools.md) | Network diagnostics and testing |
| 03 | [Browser Tools](./reference/03_Browser_Tools.md) | Browser automation for captive portals |

### Design Documents

| # | Document | Description |
|---|----------|-------------|
| 10 | [EAP-TLS Authentication](./design/10_EAP-TLS_Design.md) | 802.1X certificate authentication design |
| 11 | [Credential Store](./design/11_Credential_Store_Design.md) | Certificate storage system design |
| 12 | [HS20 / Passpoint](./design/12_HS20_Design.md) | Hotspot 2.0 auto-discovery design |
| 13 | [Dual-MCP Playwright](./design/13_Dual_MCP_Playwright_Design.md) | `/playwright-mcp` reverse proxy design |
| — | [MAC Address Restoration](./design/mac-address-restoration.md) | Docker MAC address decision record |

### User Stories

| # | Document | Description |
|---|----------|-------------|
| 40 | [WiFi Stories](./user-stories/40_WiFi_Stories.md) | WiFi connection, management, and diagnostics (13 stories) |
| 41 | [Connectivity Stories](./user-stories/41_Connectivity_Stories.md) | Network diagnostics — ping, DNS, internet, captive portal (4 stories) |
| 42 | [Browser Stories](./user-stories/42_Browser_Stories.md) | Browser automation for captive portals (3 stories) |
| 43 | [Credential Stories](./user-stories/43_Credential_Stories.md) | EAP-TLS certificate management (4 stories) |
| 44 | [Cross-Cutting Stories](./user-stories/44_Cross_Cutting_Stories.md) | MAC privacy, Docker isolation (3 stories) |

### Plans

| # | Document | Description |
|---|----------|-------------|
| 30 | [Docker Dev Plan](./plans/30_Docker_Dev_Plan.md) | Docker production-readiness roadmap |

### Operations

| # | Document | Description |
|---|----------|-------------|
| 20 | [Troubleshooting](./operations/20_Troubleshooting.md) | Docker and DNS troubleshooting guide |

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

Both endpoints run on the same external port (3000). Add to Claude
Desktop config:

```json
{
  "mcpServers": {
    "wpa-mcp": {
      "url": "http://localhost:3000/mcp"
    },
    "wpa-playwright": {
      "url": "http://localhost:3000/playwright-mcp"
    }
  }
}
```

Or via Claude Code CLI:

```bash
claude mcp add wpa-mcp         --transport http http://localhost:3000/mcp
claude mcp add wpa-playwright  --transport http http://localhost:3000/playwright-mcp
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
