#!/usr/bin/env bash
#
# docker-run.sh -- Start wpa-mcp in Docker with netns-isolated WiFi
#
# Moves a physical WiFi interface into the container's network namespace
# so that all WiFi routes/IP stay inside the container and never touch
# the host routing table.
#
# Usage:
#   sudo ./scripts/docker-run.sh [WIFI_INTERFACE]
#
# Environment:
#   WIFI_INTERFACE   WiFi interface name (default: wlan0, or first arg)
#   WPA_MCP_IMAGE    Docker image name  (default: wpa-mcp:latest)
#   WPA_MCP_PORT     Host port to forward (default: 3000)
#
set -euo pipefail

IFACE="${1:-${WIFI_INTERFACE:-wlan0}}"
IMAGE="${WPA_MCP_IMAGE:-wpa-mcp:latest}"
PORT="${WPA_MCP_PORT:-3000}"
CONTAINER_NAME="wpa-mcp"

# --- Preflight checks ---

if [[ $EUID -ne 0 ]]; then
  echo "Error: must run as root (need ip link set netns)"
  echo "Usage: sudo $0 [WIFI_INTERFACE]"
  exit 1
fi

if ! ip link show "$IFACE" &>/dev/null; then
  echo "Error: interface '$IFACE' not found on host"
  echo "Available wireless interfaces:"
  ip link show | grep -E "^[0-9]+: wl" || echo "  (none)"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "Error: docker not found"
  exit 1
fi

# --- Unmanage from NetworkManager if present ---

if command -v nmcli &>/dev/null; then
  if nmcli device status 2>/dev/null | grep -q "$IFACE.*managed"; then
    echo "Setting $IFACE as unmanaged in NetworkManager..."
    nmcli device set "$IFACE" managed no 2>/dev/null || true
  fi
fi

# --- Stop any existing container ---

if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
  echo "Stopping existing $CONTAINER_NAME container..."
  docker rm -f "$CONTAINER_NAME" &>/dev/null || true
  sleep 1
fi

# --- Start container (bridge network, port forwarded) ---

echo "Starting container '$CONTAINER_NAME' from image '$IMAGE'..."
docker run --rm -d \
  --name "$CONTAINER_NAME" \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -p "${PORT}:3000" \
  -e "WIFI_INTERFACE=${IFACE}" \
  "$IMAGE"

# --- Move WiFi interface into container netns ---

CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' "$CONTAINER_NAME")
echo "Container PID: $CONTAINER_PID"
echo "Moving $IFACE into container network namespace..."
ip link set "$IFACE" netns "$CONTAINER_PID"

# --- Verify ---

echo ""
echo "=== Setup complete ==="
echo ""
echo "Interface '$IFACE' moved into container (PID $CONTAINER_PID)"
echo ""
echo "Verify host (no $IFACE):"
echo "  ip link show $IFACE          # should fail: does not exist"
echo "  ip route                      # should have no $IFACE routes"
echo ""
echo "Verify container:"
echo "  docker exec $CONTAINER_NAME ip link show $IFACE"
echo "  docker exec $CONTAINER_NAME ip route"
echo ""
echo "MCP endpoint: http://localhost:${PORT}/mcp"
echo "Health check: curl http://localhost:${PORT}/health"
echo ""
echo "To stop and return $IFACE to host:"
echo "  docker rm -f $CONTAINER_NAME"
