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

## Git Workflow

### Feature Development Process

1. **Create a feature branch** from main:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/my-feature
   ```

2. **Make changes and commit**:
   ```bash
   git add <files>
   git commit -m "Description of changes"
   ```

3. **Push and create PR**:
   ```bash
   git push -u origin feature/my-feature
   gh pr create --title "Title" --body "Description"
   ```

4. **After PR is approved, merge and delete branch**:
   ```bash
   gh pr merge <number> --merge --delete-branch
   ```

5. **Update local main**:
   ```bash
   git checkout main
   git pull
   ```

### Branch Naming Conventions

- `feature/` - New features (e.g., `feature/bssid-support`)
- `fix/` - Bug fixes (e.g., `fix/scan-timeout`)
- `refactor/` - Code refactoring (e.g., `refactor/wpa-cli`)

### Important

- Always create feature branches for PRs - never commit directly to main
- Delete branches after merge to keep the repository clean
- Use `--delete-branch` flag with `gh pr merge` to auto-delete

## Code Review Guidelines

### Core Principles

#### Readability First
- Code is read more than written - optimize for the reader
- Separate concerns into focused modules (e.g., file I/O vs business logic)
- Use clear, descriptive names that explain intent
- Add comments for "why", not "what"
- Keep functions short enough to understand at a glance

#### Consistency Over Cleverness
- Same patterns for same problems
- If you solve authentication one way, solve it the same way everywhere
- Consistent naming conventions throughout the codebase
- Follow existing code style in the file you're editing

#### Fail Fast with Context
- Let code fail immediately when inputs are invalid
- Include enough context in errors for debugging (what failed, what was expected)
- Use structured error types when helpful for handling
- Propagate errors up with added context, don't swallow them

#### Observability by Design
- Log at appropriate levels: error, warn, info, debug
- Include correlation IDs for request tracing
- Log at boundaries: incoming requests, outgoing calls, state changes
- Structure logs as JSON for parsing (timestamp, level, message, context)
- Never log sensitive data (passwords, keys, tokens, PII)

#### Metrics for Operations
- Track request counts, latencies, error rates
- Instrument critical paths (connection attempts, auth flows)
- Use histograms for latency, counters for events
- Include labels for dimensionality (method, status, error_type)

### New Feature Guidelines

#### Design Documents Required
- Before implementing a new feature, create a design document in `/docs`
- Document the original design intent, architecture decisions, and rationale
- This preserves context for future maintenance and prevents design drift
- Keep design docs simple: problem statement, proposed solution, key decisions

### What to Look For

#### ✅ Approve
- Clear separation of concerns
- Code that follows existing patterns in the codebase
- Appropriate logging at boundaries and errors
- Clear, descriptive variable/function names
- Proper error handling with context

#### ❌ Request Changes
- Mixed concerns in a single function/module
- Missing error context (bare throws, swallowed errors)
- Missing logs at critical operations
- Logging sensitive information
- Different patterns for the same type of problem
- Files containing private information (passwords, API keys, tokens, credentials, internal URLs)

### Review Checklist

1. **Is it readable?** Can a new developer understand this in 5 minutes?
2. **Does it follow existing patterns?** Look for similar code elsewhere in the codebase
3. **Are errors informative?** Do they include context for debugging?
4. **Is logging appropriate?** Boundaries logged, sensitive data excluded?
5. **Are concerns separated?** Each module/function does one thing?
6. **No private information?** Check for passwords, API keys, tokens, internal URLs, or credentials

### Logging Guidelines

```javascript
// Good - structured, contextual, appropriate level
logger.info('wifi connection started', { ssid, interface: iface, requestId });
logger.error('connection failed', { ssid, error: err.message, elapsed_ms, requestId });

// Bad - unstructured, missing context
console.log('connecting...');
console.log('error: ' + err);

// Good - debug for detailed tracing
logger.debug('wpa_cli command', { command: 'add_network', result: networkId });

// Bad - logging sensitive data
logger.info('connecting with password', { ssid, password }); // NEVER DO THIS
```

### Error Handling

```javascript
// Good - context preserved, actionable
async function connectTls(ssid, identity, certs) {
  const networkId = await wpa.addNetwork();
  
  try {
    await wpa.setNetwork(networkId, 'ssid', ssid);
    await wpa.setNetwork(networkId, 'eap', 'TLS');
    // ...
  } catch (err) {
    await wpa.removeNetwork(networkId).catch(() => {});
    throw new Error(`EAP-TLS connection to ${ssid} failed: ${err.message}`);
  }
}

// Bad - swallowed error, no context
async function connectTls(ssid, identity, certs) {
  try {
    // ...
  } catch (err) {
    return { success: false }; // What failed? Why?
  }
}
```

### Remember
- Readability and maintainability are non-negotiable
- Good logs save hours of debugging
- Errors should tell you what went wrong and where
- Separate concerns, even if it means more files
- Consistency beats perfection
