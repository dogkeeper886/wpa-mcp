#!/usr/bin/env bash
#
# docker-entrypoint.sh -- Entrypoint for wpa-mcp Docker container
#
# Prepares the container's network namespace for WiFi isolation:
# 1. Deletes the Docker bridge default route so dhclient can add WiFi
#    as the sole default when a connection is established
# 2. Brings up the WiFi interface if it's already present
# 3. Execs the Node.js server
#
# The bridge subnet route (172.17.0.0/16 dev eth0) is preserved so the
# MCP client can reach the server via Docker port forwarding.
#
# Environment:
#   WIFI_INTERFACE       WiFi interface name (default: wlan0)
#   KEEP_BRIDGE_DEFAULT  Set to "1" to skip bridge default route deletion
#
set -euo pipefail

IFACE="${WIFI_INTERFACE:-wlan0}"

# Delete Docker bridge default route so WiFi becomes the sole default
# when dhclient runs during wifi_connect. The bridge subnet route is
# preserved for MCP client access via Docker port forwarding.
if [[ "${KEEP_BRIDGE_DEFAULT:-}" != "1" ]]; then
  if ip route show default 2>/dev/null | grep -q "dev eth0"; then
    echo "entrypoint: deleting bridge default route"
    sudo ip route del default 2>/dev/null || true
  fi
fi

# Bring WiFi interface up if present (phy may be moved in after start)
if ip link show "$IFACE" &>/dev/null; then
  echo "entrypoint: bringing $IFACE up"
  sudo ip link set "$IFACE" up 2>/dev/null || true
fi

# Auto-import certificates into credential store on first boot
if [ -d /app/certs ] && [ "$(ls -A /app/certs 2>/dev/null)" ]; then
  echo "entrypoint: importing certificates..."
  node /app/scripts/import-certs.mjs || echo "entrypoint: cert import failed (non-fatal)"
fi

# Start Microsoft Playwright MCP in the background so a browser launched
# by that server shares this container's network namespace -- essential for
# reaching captive portals on the WLAN joined via wifi_connect. Bound to
# loopback only; external clients reach it via wpa-mcp's /playwright-mcp
# reverse proxy (which also injects a server-level `instructions` string
# describing the intent so agents know when to pick this server).
PLAYWRIGHT_MCP_PORT="${PLAYWRIGHT_MCP_PORT:-8931}"
echo "entrypoint: starting Microsoft Playwright MCP on 127.0.0.1:${PLAYWRIGHT_MCP_PORT}"
# Use the binary directly, not `npx`, because the container has no default
# route to npm's registry (entrypoint deletes the Docker bridge default).
# Flags follow the upstream @playwright/mcp Docker guidance:
#   --headless          no display server available in the container
#   --browser chromium  use the Playwright-packaged Chromium (pre-baked
#                       into the image at PLAYWRIGHT_BROWSERS_PATH)
#   --no-sandbox        Chromium's setuid sandbox needs caps we don't grant
# Launched from /tmp because playwright-mcp creates a `.playwright-mcp/`
# artifact dir in its CWD; /app is owned by root and the node user cannot
# write there.
(cd /tmp && playwright-mcp \
  --headless \
  --browser chromium \
  --no-sandbox \
  --port "${PLAYWRIGHT_MCP_PORT}" \
  --host 127.0.0.1) \
  > /tmp/playwright-mcp.log 2>&1 &
PLAYWRIGHT_MCP_PID=$!

# Sanity-check: wait briefly for playwright-mcp to bind so a failure to
# launch surfaces as a clear log line instead of opaque 500s from the
# reverse proxy at runtime.
for i in 1 2 3 4 5; do
  if ! kill -0 "$PLAYWRIGHT_MCP_PID" 2>/dev/null; then
    echo "entrypoint: ERROR -- playwright-mcp exited during startup; see /tmp/playwright-mcp.log"
    break
  fi
  if ss -tln 2>/dev/null | grep -q ":${PLAYWRIGHT_MCP_PORT} "; then
    echo "entrypoint: playwright-mcp listening on 127.0.0.1:${PLAYWRIGHT_MCP_PORT} (pid ${PLAYWRIGHT_MCP_PID})"
    break
  fi
  sleep 1
  if [ "$i" = 5 ]; then
    echo "entrypoint: WARNING -- playwright-mcp did not bind to ${PLAYWRIGHT_MCP_PORT} within 5s; the /playwright-mcp proxy will fail. See /tmp/playwright-mcp.log"
  fi
done

# Hand off to Node.js server
exec node dist/index.js "$@"
