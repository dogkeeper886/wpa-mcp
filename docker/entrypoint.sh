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

# Hand off to Node.js server
exec node dist/index.js "$@"
