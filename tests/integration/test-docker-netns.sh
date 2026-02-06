#!/usr/bin/env bash
#
# test-docker-netns.sh -- Integration test for Docker + netns WiFi isolation
#
# Verifies that wpa-mcp running in a Docker container with a physical WiFi
# interface moved into its network namespace does NOT leak routes, IPs, or
# DHCP state into the host routing table.
#
# Requirements:
#   - Root privileges (sudo)
#   - A real WiFi interface on the test machine
#   - Docker installed
#   - A WiFi network to connect to (TEST_SSID / TEST_PSK)
#
# Usage:
#   sudo TEST_SSID="MyNetwork" TEST_PSK="password" ./tests/integration/test-docker-netns.sh
#
# Environment:
#   WIFI_INTERFACE   WiFi interface name    (default: wlan0)
#   TEST_SSID        SSID to connect to     (required)
#   TEST_PSK         Password               (optional, empty = open network)
#   WPA_MCP_IMAGE    Docker image name      (default: wpa-mcp:test)
#   SKIP_BUILD       Set to 1 to skip image build
#
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────

IFACE="${WIFI_INTERFACE:-wlan0}"
IMAGE="${WPA_MCP_IMAGE:-wpa-mcp:test}"
CONTAINER_NAME="wpa-mcp-test"
PORT=3199  # unusual port to avoid conflicts
SSID="${TEST_SSID:-}"
PSK="${TEST_PSK:-}"
SKIP_BUILD="${SKIP_BUILD:-0}"

PASS_COUNT=0
FAIL_COUNT=0
CLEANUP_DONE=0

# ── Helpers ────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${BOLD}[TEST]${NC} $*"; }
pass() { echo -e "  ${GREEN}PASS${NC}: $*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}: $*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC}: $*"; }
skip() { echo -e "  ${YELLOW}SKIP${NC}: $*"; }

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    pass "$desc"
  else
    fail "$desc (expected='$expected', actual='$actual')"
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    pass "$desc"
  else
    fail "$desc (expected to contain '$needle')"
  fi
}

assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -q "$needle"; then
    fail "$desc (should NOT contain '$needle')"
  else
    pass "$desc"
  fi
}

assert_cmd_succeeds() {
  local desc="$1"; shift
  if "$@" &>/dev/null; then
    pass "$desc"
  else
    fail "$desc (command failed: $*)"
  fi
}

assert_cmd_fails() {
  local desc="$1"; shift
  if "$@" &>/dev/null; then
    fail "$desc (command should have failed: $*)"
  else
    pass "$desc"
  fi
}

# MCP JSON-RPC call helper
mcp_call() {
  local method="$1"
  local params="$2"
  curl -s -X POST "http://localhost:${PORT}/mcp" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"${method}\",\"arguments\":${params}}}"
}

wait_for_health() {
  local max_attempts=30
  local attempt=0
  while [[ $attempt -lt $max_attempts ]]; do
    if curl -sf "http://localhost:${PORT}/health" &>/dev/null; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  return 1
}

# ── Cleanup (runs on exit) ─────────────────────────────────────────────

cleanup() {
  if [[ $CLEANUP_DONE -eq 1 ]]; then
    return
  fi
  CLEANUP_DONE=1

  log "Cleaning up..."

  # Stop container (this returns the interface to host)
  docker rm -f "$CONTAINER_NAME" &>/dev/null || true
  sleep 2

  # Wait for interface to reappear on host
  local wait=0
  while ! ip link show "$IFACE" &>/dev/null && [[ $wait -lt 10 ]]; do
    sleep 1
    wait=$((wait + 1))
  done

  if ip link show "$IFACE" &>/dev/null; then
    log "Interface $IFACE returned to host"
  else
    warn "Interface $IFACE did not return to host after cleanup"
  fi
}
trap cleanup EXIT

# ── Preflight ──────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
  echo "Error: must run as root"
  echo "Usage: sudo TEST_SSID=... TEST_PSK=... $0"
  exit 1
fi

if [[ -z "$SSID" ]]; then
  echo "Error: TEST_SSID is required"
  echo "Usage: sudo TEST_SSID=\"MyNetwork\" TEST_PSK=\"password\" $0"
  exit 1
fi

if ! ip link show "$IFACE" &>/dev/null; then
  echo "Error: interface '$IFACE' not found"
  exit 1
fi

if ! command -v docker &>/dev/null; then
  echo "Error: docker not found"
  exit 1
fi

# ======================================================================
# PHASE 1: Setup
# ======================================================================

log "Phase 1: Setup"

# Unmanage from NM if needed
if command -v nmcli &>/dev/null; then
  nmcli device set "$IFACE" managed no 2>/dev/null || true
fi

# Record baseline host routes
BASELINE_ROUTES=$(ip route show)
log "Baseline host routes recorded ($(echo "$BASELINE_ROUTES" | wc -l) lines)"

# Build image
if [[ "$SKIP_BUILD" != "1" ]]; then
  log "Building Docker image '$IMAGE'..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  docker build -t "$IMAGE" "$REPO_ROOT"
else
  log "Skipping build (SKIP_BUILD=1)"
fi

# Stop any leftover container
docker rm -f "$CONTAINER_NAME" &>/dev/null || true

# Start container (bridge network, port forwarded)
log "Starting container..."
docker run --rm -d \
  --name "$CONTAINER_NAME" \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -p "${PORT}:3000" \
  -e "WIFI_INTERFACE=${IFACE}" \
  "$IMAGE"

CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' "$CONTAINER_NAME")
log "Container PID: $CONTAINER_PID"

# Move interface into container netns
log "Moving $IFACE into container network namespace..."
ip link set "$IFACE" netns "$CONTAINER_PID"

# Give the server time to start
log "Waiting for wpa-mcp server..."
if ! wait_for_health; then
  fail "Server health check did not pass within 30s"
  log "Container logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -20
  exit 1
fi
pass "Server health check passed"

# ======================================================================
# PHASE 2: Verify isolation (pre-connect)
# ======================================================================

log "Phase 2: Verify isolation (pre-connect)"

# wlan0 should NOT exist on host
assert_cmd_fails \
  "Interface $IFACE does not exist on host" \
  ip link show "$IFACE"

# wlan0 SHOULD exist in container
assert_cmd_succeeds \
  "Interface $IFACE exists inside container" \
  docker exec "$CONTAINER_NAME" ip link show "$IFACE"

# Host routes unchanged
CURRENT_ROUTES=$(ip route show)
assert_eq \
  "Host route table unchanged (pre-connect)" \
  "$BASELINE_ROUTES" \
  "$CURRENT_ROUTES"

# ======================================================================
# PHASE 3: WiFi connect via MCP
# ======================================================================

log "Phase 3: WiFi connect via MCP"

# Scan
log "Calling wifi_scan..."
SCAN_RESULT=$(mcp_call "wifi_scan" '{}')
if echo "$SCAN_RESULT" | grep -q "content"; then
  pass "wifi_scan returned content"
else
  fail "wifi_scan did not return content"
  log "Response: $SCAN_RESULT"
fi

# Check test SSID is visible
if echo "$SCAN_RESULT" | grep -q "$SSID"; then
  pass "Test SSID '$SSID' found in scan results"
else
  warn "Test SSID '$SSID' not found in scan (may still connect)"
fi

# Connect
log "Calling wifi_connect (ssid=$SSID)..."
if [[ -n "$PSK" ]]; then
  CONNECT_PARAMS="{\"ssid\":\"${SSID}\",\"password\":\"${PSK}\"}"
else
  CONNECT_PARAMS="{\"ssid\":\"${SSID}\"}"
fi

CONNECT_RESULT=$(mcp_call "wifi_connect" "$CONNECT_PARAMS")

if echo "$CONNECT_RESULT" | grep -qi "success.*true\|COMPLETED\|ip_address"; then
  pass "wifi_connect succeeded"
else
  fail "wifi_connect did not report success"
  log "Response: $CONNECT_RESULT"
fi

# Check IP assigned
if echo "$CONNECT_RESULT" | grep -qoE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'; then
  WIFI_IP=$(echo "$CONNECT_RESULT" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  pass "WiFi IP assigned: $WIFI_IP"
else
  warn "Could not extract IP from connect response"
fi

# Brief pause for routes to settle
sleep 2

# ======================================================================
# PHASE 4: Verify isolation (post-connect)
# ======================================================================

log "Phase 4: Verify isolation (post-connect)"

# HOST routes must still match baseline (the critical test)
CURRENT_ROUTES=$(ip route show)
assert_eq \
  "Host route table unchanged after WiFi connect" \
  "$BASELINE_ROUTES" \
  "$CURRENT_ROUTES"

# Host must NOT have any wlan0 routes
assert_not_contains \
  "Host has no $IFACE routes" \
  "$CURRENT_ROUTES" \
  "$IFACE"

# Container SHOULD have a default route via wlan0
CONTAINER_ROUTES=$(docker exec "$CONTAINER_NAME" ip route show 2>/dev/null || echo "")
assert_contains \
  "Container has default route via $IFACE" \
  "$CONTAINER_ROUTES" \
  "default.*dev ${IFACE}"

# Container should have an IP on wlan0
CONTAINER_ADDR=$(docker exec "$CONTAINER_NAME" ip addr show "$IFACE" 2>/dev/null || echo "")
assert_contains \
  "Container has IP address on $IFACE" \
  "$CONTAINER_ADDR" \
  "inet "

# Container can ping the internet via wlan0
log "Testing internet connectivity from container..."
if docker exec "$CONTAINER_NAME" ping -c 2 -W 5 -I "$IFACE" 8.8.8.8 &>/dev/null; then
  pass "Container can ping 8.8.8.8 via $IFACE"
else
  fail "Container cannot ping 8.8.8.8 via $IFACE"
fi

# ======================================================================
# PHASE 5: Disconnect and cleanup
# ======================================================================

log "Phase 5: Disconnect and cleanup"

# Disconnect via MCP
log "Calling wifi_disconnect..."
DISCONNECT_RESULT=$(mcp_call "wifi_disconnect" '{}')
if echo "$DISCONNECT_RESULT" | grep -qi "success\|disconnect\|content"; then
  pass "wifi_disconnect returned"
else
  warn "wifi_disconnect response unclear: $DISCONNECT_RESULT"
fi

sleep 2

# Container wlan0 routes should be gone
CONTAINER_ROUTES_AFTER=$(docker exec "$CONTAINER_NAME" ip route show 2>/dev/null || echo "")
assert_not_contains \
  "Container has no default $IFACE route after disconnect" \
  "$CONTAINER_ROUTES_AFTER" \
  "default.*dev ${IFACE}"

# Stop container (triggers cleanup trap too, but be explicit)
log "Stopping container..."
docker rm -f "$CONTAINER_NAME" &>/dev/null || true
CLEANUP_DONE=1
sleep 2

# Wait for interface to return
WAIT=0
while ! ip link show "$IFACE" &>/dev/null && [[ $WAIT -lt 10 ]]; do
  sleep 1
  WAIT=$((WAIT + 1))
done

# Interface should be back on host
assert_cmd_succeeds \
  "Interface $IFACE returned to host after container stopped" \
  ip link show "$IFACE"

# Host routes should match baseline
FINAL_ROUTES=$(ip route show)
assert_eq \
  "Host route table matches baseline after cleanup" \
  "$BASELINE_ROUTES" \
  "$FINAL_ROUTES"

# ======================================================================
# Summary
# ======================================================================

echo ""
echo "=============================="
echo -e "  ${GREEN}PASSED${NC}: $PASS_COUNT"
echo -e "  ${RED}FAILED${NC}: $FAIL_COUNT"
echo "=============================="
echo ""

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo -e "${RED}INTEGRATION TEST FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}INTEGRATION TEST PASSED${NC}"
  exit 0
fi
