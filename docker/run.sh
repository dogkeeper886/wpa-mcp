#!/usr/bin/env bash
#
# run.sh -- Start wpa-mcp in Docker with netns-isolated WiFi
#
# Moves a physical WiFi phy device into the container's network namespace
# so that all WiFi routes/IP stay inside the container and never touch
# the host routing table.
#
# Uses "iw phy <phy> set netns <pid>" which works with all WiFi drivers
# (including iwlwifi which blocks "ip link set netns").
#
# Usage:
#   sudo ./docker/run.sh [WIFI_INTERFACE]
#
# Environment (can be set in .env at project root):
#   WIFI_INTERFACE   WiFi interface name (default: wlan0, or first arg)
#   WPA_MCP_IMAGE    Docker image name  (default: wpa-mcp:latest)
#   PORT             Host port to forward (default: 3000)
#   WPA_DEBUG_LEVEL  Debug verbosity 1-3 (default: 2)
#
set -euo pipefail

# Source .env from project root if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

IFACE="${1:-${WIFI_INTERFACE:-wlan0}}"
IMAGE="${WPA_MCP_IMAGE:-wpa-mcp:latest}"
HOST_PORT="${PORT:-3000}"
DEBUG_LEVEL="${WPA_DEBUG_LEVEL:-2}"
CONTAINER_NAME="wpa-mcp"

# --- Preflight checks ---

if [[ $EUID -ne 0 ]]; then
  echo "Error: must run as root (need iw phy set netns)"
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

if ! command -v iw &>/dev/null; then
  echo "Error: iw not found (needed for phy netns move)"
  exit 1
fi

# --- Check for host wpa_supplicant binding this interface ---

if pgrep -a wpa_supplicant 2>/dev/null | grep -q -- "-i[[:space:]]*${IFACE}"; then
  echo "Warning: host wpa_supplicant is bound to $IFACE"
  echo "  This will conflict with the container's wpa_supplicant."
  echo "  Stop it first:  sudo pkill -f 'wpa_supplicant.*-i.*${IFACE}'"
  echo "  Or if managed by systemd:  sudo systemctl stop wpa_supplicant"
  exit 1
fi

# --- Resolve phy device from interface ---

PHY=$(cat "/sys/class/net/${IFACE}/phy80211/name" 2>/dev/null || true)
if [[ -z "$PHY" ]]; then
  echo "Error: cannot resolve phy device for '$IFACE'"
  echo "Is '$IFACE' a wireless interface?"
  exit 1
fi
echo "Resolved $IFACE -> $PHY"

# --- Unmanage from NetworkManager if present ---

if command -v nmcli &>/dev/null; then
  if nmcli device status 2>/dev/null | grep -q "$IFACE.*managed"; then
    echo "Setting $IFACE as unmanaged in NetworkManager..."
    nmcli device set "$IFACE" managed no 2>/dev/null || true
  fi
fi

# --- Bring interface down before moving ---

ip link set "$IFACE" down 2>/dev/null || true

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
  -p "${HOST_PORT}:3000" \
  -e "WIFI_INTERFACE=${IFACE}" \
  -e "WPA_DEBUG_LEVEL=${DEBUG_LEVEL}" \
  -e "PORT=3000" \
  "$IMAGE"

# --- Move WiFi phy into container netns ---

CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' "$CONTAINER_NAME")
echo "Container PID: $CONTAINER_PID"
echo "Moving $PHY into container network namespace..."
iw phy "$PHY" set netns "$CONTAINER_PID"

# The interface may get a different name inside the container.
# Wait a moment then discover it.
sleep 1
CONTAINER_IFACE=$(docker exec "$CONTAINER_NAME" \
  sh -c 'ls /sys/class/ieee80211/*/device/net/ 2>/dev/null | head -1' || true)

if [[ -z "$CONTAINER_IFACE" ]]; then
  echo "Warning: could not detect WiFi interface name inside container"
  CONTAINER_IFACE="$IFACE"
fi

echo "WiFi interface inside container: $CONTAINER_IFACE"

# If the name changed, update the env var (restart not needed, but inform)
if [[ "$CONTAINER_IFACE" != "$IFACE" ]]; then
  echo "Note: interface renamed from '$IFACE' to '$CONTAINER_IFACE' inside container"
  echo "You may need to set WIFI_INTERFACE=$CONTAINER_IFACE"
fi

# --- Wait for server to be ready ---
# The entrypoint script deletes the Docker bridge default route on
# startup so dhclient adds WiFi as the sole default when it connects.

echo "Waiting for server to start..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${HOST_PORT}/health" &>/dev/null; then
    break
  fi
  sleep 1
done

# --- Verify ---

echo ""
echo "=== Setup complete ==="
echo ""
echo "Phy '$PHY' moved into container (PID $CONTAINER_PID)"
echo ""
echo "Verify host (no $IFACE):"
echo "  ip link show $IFACE          # should fail: does not exist"
echo "  ip route                      # should have no $IFACE routes"
echo ""
echo "Verify container:"
echo "  docker exec $CONTAINER_NAME ip link show $CONTAINER_IFACE"
echo "  docker exec $CONTAINER_NAME ip route"
echo ""
echo "MCP endpoint: http://localhost:${HOST_PORT}/mcp"
echo "Health check: curl http://localhost:${HOST_PORT}/health"
echo ""
echo "To stop and return phy to host:"
echo "  docker rm -f $CONTAINER_NAME"
