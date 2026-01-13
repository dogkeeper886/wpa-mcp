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

## Code Review Guidelines

### Core Principles

#### Simplicity First
- Choose the simplest solution that works
- Avoid abstractions until you have 3+ concrete use cases
- Delete code rather than comment it out
- One responsibility per function/class

#### Fail Fast, Fail Loud
- No defensive programming or extensive validation
- Let the code fail immediately when inputs are invalid
- Use language built-ins for type checking
- Crash early rather than propagate bad state

#### Consistency Over Cleverness
- Same patterns for same problems
- If you solve authentication one way, solve it the same way everywhere
- Consistent naming conventions throughout the codebase
- Follow existing code style in the file you're editing

#### No Complex Debug/Logging
- Avoid complicated logging infrastructure
- No elaborate debug systems or verbose error messages
- Simple console output when absolutely necessary
- Trust stack traces for debugging

#### No Health Checks or Redundant Validation
- Don't validate inputs that the language/framework already validates
- No "health check" endpoints or status monitoring code
- Trust your dependencies to work or fail appropriately
- Remove code that checks for "impossible" conditions

### New Feature Guidelines

#### Design Documents Required
- Before implementing a new feature, create a design document in `/docs`
- Document the original design intent, architecture decisions, and rationale
- This preserves context for future maintenance and prevents design drift
- Keep design docs simple: problem statement, proposed solution, key decisions

### What to Look For

#### ✅ Approve
- Direct, obvious implementations
- Code that follows existing patterns in the codebase
- Minimal abstractions
- Clear, descriptive variable/function names
- Removal of unnecessary code

#### ❌ Request Changes
- Over-abstraction (interfaces with single implementations)
- Defensive validation of already-validated inputs
- Health checks, status endpoints, or monitoring code
- Complex logging or debugging infrastructure
- Different patterns for the same type of problem
- Code that tries to "be safe" instead of being correct
- Files containing private information (passwords, API keys, tokens, credentials, internal URLs)

### Review Checklist

1. **Is this the simplest approach?** Can it be done with fewer lines/files/abstractions?
2. **Does it follow existing patterns?** Look for similar code elsewhere in the codebase
3. **Does it fail fast?** No graceful degradation or fallback logic
4. **Is validation necessary?** Remove checks that duplicate language/framework validation
5. **Can any code be deleted?** Less code is better code
6. **Is logging/debugging simple?** No complex debug infrastructure
7. **No private information?** Check for passwords, API keys, tokens, internal URLs, or credentials

### Examples

#### Good
```javascript
function createUser(email, password) {
  return db.users.create({ email, password });
}
```

#### Bad
```javascript
function createUser(email, password) {
  logger.debug('Creating user', { email });
  
  if (!email || typeof email !== 'string') {
    logger.error('Invalid email provided');
    throw new Error('Invalid email');
  }
  if (!password || password.length < 8) {
    logger.warn('Password validation failed');
    throw new Error('Password too short');
  }
  
  try {
    const user = db.users.create({ email, password });
    logger.info('User created successfully', { userId: user.id });
    return { success: true, user };
  } catch (error) {
    logger.error('User creation failed', error);
    return { success: false, error: error.message };
  }
}
```

### Remember
- Code should be boring and predictable
- When in doubt, delete it
- Trust your tools and dependencies
- Consistency beats perfection
- Simple failures are better than complex success handling
