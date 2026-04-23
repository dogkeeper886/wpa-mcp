<!--
This file is the Docker Hub description for dogkeeper886/wpa-mcp.
Paste the **short description** (below) into the 100-char field on
Docker Hub, then paste the full body (from the first `#` heading
onwards) into the Overview tab.

Short description (99 chars):
  MCP server for Wi-Fi control (WPA/EAP/TLS/HS20) + Playwright MCP inside container's Wi-Fi netns
-->

# wpa-mcp

MCP (Model Context Protocol) server that lets Claude and other MCP clients drive Wi-Fi on Linux via `wpa_supplicant` — WPA-PSK, WPA2-Enterprise (PEAP/TTLS), EAP-TLS, Hotspot 2.0 / Passpoint, captive portals, MAC randomization.

Source: **https://github.com/dogkeeper886/wpa-mcp**

---

## Tags

| Tag      | Description                              |
|----------|------------------------------------------|
| `2.0.0`  | First tagged release                     |
| `latest` | Tracks the latest stable tag (= `2.0.0`) |

---

## What's inside

- **wpa-mcp** (Node.js / MCP SDK) exposes `/mcp` with Wi-Fi, credential, connectivity, and scripted-browser tools.
- **Microsoft Playwright MCP** (`@playwright/mcp@0.0.70`) runs as a subprocess at `127.0.0.1:8931` and is reverse-proxied at `/playwright-mcp`. Its browser shares the container's Wi-Fi network namespace, so it can reach captive portals on the WLAN the container has joined — impossible from the host.
- Chromium is pre-baked into the image (~170 MiB); no runtime downloads are needed.
- Only port **3000** is exposed externally.

---

## Quick start (requires host setup)

This image needs the host to move the Wi-Fi phy into the container's netns. The easiest path is to clone the repo and use the provided Makefile:

```bash
git clone https://github.com/dogkeeper886/wpa-mcp
cd wpa-mcp

# Tell the Makefile to use the Docker Hub image instead of building locally
echo "WPA_MCP_IMAGE=dogkeeper886/wpa-mcp:2.0.0" >> .env

# Unmanage the Wi-Fi interface from NetworkManager (one-time, persistent)
sudo make nm-unmanage WIFI_INTERFACE=wlp6s0

# Start the container (moves phy into container netns, waits for health)
sudo make docker-start
```

Register the MCP endpoints in Claude Code:

```bash
claude mcp add wpa-mcp         --transport http http://localhost:3000/mcp
claude mcp add wpa-playwright  --transport http http://localhost:3000/playwright-mcp
```

---

## Endpoints

| Path                              | Transport                   | Purpose                                                     |
|-----------------------------------|-----------------------------|-------------------------------------------------------------|
| `POST /mcp`                       | Streamable HTTP (stateless) | Wi-Fi / credentials / connectivity / scripted Playwright    |
| `POST/GET/DELETE /playwright-mcp` | Streamable HTTP (stateful)  | Step-by-step browser control inside the container's netns   |
| `GET /health`                     | HTTP                        | Health check                                                |

The proxied Playwright MCP injects a server-level `instructions` string into its `initialize` response so agents automatically know when to pick it over a host-side `playwright` MCP.

---

## Requirements on the host

- Linux with Docker
- `iw` (`sudo dnf install iw` or `sudo apt install iw`)
- A PCIe or USB Wi-Fi adapter
- The Wi-Fi interface unmanaged by NetworkManager (the repo's `make nm-unmanage` target handles this)

---

## Docs

- Full README: https://github.com/dogkeeper886/wpa-mcp#readme
- Architecture: https://github.com/dogkeeper886/wpa-mcp/blob/main/docs/reference/00_Architecture.md
- Dual-MCP Playwright design: https://github.com/dogkeeper886/wpa-mcp/blob/main/docs/design/13_Dual_MCP_Playwright_Design.md
- Netns isolation: https://github.com/dogkeeper886/wpa-mcp/blob/main/docs/reference/05_Docker_Netns_Isolation.md
- Troubleshooting: https://github.com/dogkeeper886/wpa-mcp/blob/main/docs/operations/20_Troubleshooting.md
- Changelog: https://github.com/dogkeeper886/wpa-mcp/blob/main/CHANGELOG.md

---

## License

MIT
