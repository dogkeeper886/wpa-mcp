# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode for development
npm start            # Run the compiled server

# Process management (via Makefile)
make start           # Start server in background (writes to wpa-mcp.log)
make stop            # Stop server
make restart         # Restart server
make logs            # Tail log file
make status          # Check if server is running
```

## Environment Configuration

Copy `.env.example` to `.env`:
- `PORT` - Server port (default: 3000)
- `HOST` - Bind address (default: 0.0.0.0)
- `WIFI_INTERFACE` - WiFi interface name (default: wlan0)
- `WPA_CONFIG_PATH` - wpa_supplicant config path
- `WPA_DEBUG_LEVEL` - Debug verbosity (1-3)

## Architecture

This is an MCP (Model Context Protocol) server that provides WiFi control via wpa_supplicant. It exposes tools that Claude/MCP clients can invoke to manage WiFi connections.

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
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ src/lib/      │     │ src/lib/      │     │ src/lib/      │
│  wpa-cli.ts   │     │ playwright-   │     │ network-      │
│  wpa-daemon.ts│     │  runner.ts    │     │  check.ts     │
│  dhcp-manager │     └───────────────┘     └───────────────┘
│  mac-utils.ts │
└───────────────┘
```

### Key Components

- **src/index.ts** - Entry point. Creates Express server, MCP server, WpaDaemon, and DhcpManager. Registers all tools.

- **src/tools/** - MCP tool definitions using Zod schemas for validation:
  - `wifi.ts` - WiFi management tools (scan, connect, connect_eap, disconnect, status, etc.)
  - `browser.ts` - Playwright script runner for captive portals
  - `connectivity.ts` - Network diagnostics (ping, DNS, captive portal detection)

- **src/lib/** - Core implementation:
  - `wpa-cli.ts` - WpaCli class wrapping `wpa_cli` commands
  - `wpa-daemon.ts` - WpaDaemon class manages wpa_supplicant process and debug logs
  - `dhcp-manager.ts` - Manages dhclient for IP address acquisition
  - `mac-utils.ts` - MAC address randomization helpers
  - `network-check.ts` - Connectivity checks using ping, DNS, HTTP
  - `playwright-runner.ts` - Runs user scripts from ~/.config/wpa-mcp/scripts/

- **src/types.ts** - TypeScript interfaces for Network, ConnectionStatus, MacAddressConfig, etc.

### Tool Registration Pattern

Tools are registered with `server.tool(name, description, zodSchema, handler)`. The handler receives validated parameters and returns `{ content: [{ type: 'text', text: JSON.stringify(...) }] }`.

### wpa_supplicant Integration

The server can run wpa_supplicant as a managed subprocess (WpaDaemon) or use an existing wpa_supplicant process. WpaCli communicates via `wpa_cli -i <interface>` shell commands. Connection flow:
1. `add_network` - creates network entry
2. `set_network` - configures SSID, PSK/EAP params, MAC settings
3. `enable_network` + `select_network` - triggers connection
4. `waitForState('COMPLETED')` - polls status until connected
5. DhcpManager runs `dhclient` to obtain IP address
