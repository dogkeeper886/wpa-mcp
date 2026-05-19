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

# Capture the bridge gateway before we (optionally) delete the default route;
# the policy-routing rule below needs it to send MCP replies back via eth0.
BRIDGE_GW="$(ip route show default 2>/dev/null | awk '/dev eth0/ {print $3; exit}')"

# Delete Docker bridge default route so WiFi becomes the sole default
# when dhclient runs during wifi_connect. The bridge subnet route is
# preserved for MCP client access via Docker port forwarding.
if [[ "${KEEP_BRIDGE_DEFAULT:-}" != "1" ]]; then
  if ip route show default 2>/dev/null | grep -q "dev eth0"; then
    echo "entrypoint: deleting bridge default route"
    sudo ip route del default 2>/dev/null || true
  fi
fi

# Source-based reply routing for inbound MCP traffic. Without this, when the
# joined WiFi LAN shares a subnet with the docker host's other interface (e.g.
# host wired and container WiFi both on 192.168.5.0/24), the kernel matches
# `192.168.5.0/24 dev wlp0s20f3` for the reply and sends SYN-ACKs out the
# WiFi side instead of back via eth0. Remote MCP clients then see TCP
# timeouts. By scoping the override to packets whose *source* is our eth0
# address, WiFi-originated traffic (src = wlp0s20f3 IP) is untouched.
ETH0_IP="$(ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1)"
if [[ -n "$ETH0_IP" && -n "$BRIDGE_GW" ]]; then
  echo "entrypoint: installing reply-path policy route (src=$ETH0_IP via $BRIDGE_GW)"
  sudo ip route add default via "$BRIDGE_GW" dev eth0 table 100 2>/dev/null || true
  sudo ip rule add from "$ETH0_IP" table 100 priority 100 2>/dev/null || true
else
  echo "entrypoint: skipping reply-path policy route (eth0_ip=$ETH0_IP bridge_gw=$BRIDGE_GW)"
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
# Flags follow the upstream @playwright/mcp Docker guidance, adapted
# for this container:
#   --headless                        no display server in the container
#   --browser chromium                use the Playwright-packaged Chromium
#                                     (pre-baked at PLAYWRIGHT_BROWSERS_PATH)
#   --no-sandbox                      Chromium's setuid sandbox needs caps
#                                     we don't grant
#   --allow-unrestricted-file-access  MCP clients send their host
#                                     workspace path (e.g. `/home/jack`)
#                                     as the root, which doesn't exist
#                                     in the container; bypass the check
#   --output-dir /tmp/playwright-mcp  Pin the artifact directory. Without
#                                     this, Playwright MCP defaults to
#                                     `<client.cwd>/.playwright-mcp`, and
#                                     mkdir -p on `/home/jack/...` fails
#                                     with EACCES as the node user. /tmp
#                                     is always writable.
PLAYWRIGHT_MCP_OUTPUT_DIR=/tmp/playwright-mcp-output
mkdir -p "$PLAYWRIGHT_MCP_OUTPUT_DIR"

# Optional i18n knobs for the headless Chromium spawned by playwright-mcp.
# When either env var is set, generate a minimal config JSON and pass it via
# --config. When both are unset, no config file is generated and no --config
# flag is appended — the launch is byte-identical to the pre-feature
# invocation. See docs/design/14_Browser_Locale_Timezone_Design.md.
PW_CONFIG_FLAG=""
if [[ -n "${WPA_MCP_BROWSER_LANG:-}" || -n "${WPA_MCP_BROWSER_TZ:-}" ]]; then
  PW_CONFIG_PATH=/tmp/playwright-mcp-config.json

  # Build the inner contextOptions field-by-field so a one-of-two config
  # stays valid JSON (no trailing comma, no orphan field).
  PW_CONTEXT_OPTS=""
  if [[ -n "${WPA_MCP_BROWSER_LANG:-}" ]]; then
    PW_CONTEXT_OPTS="\"locale\": \"${WPA_MCP_BROWSER_LANG}\""
  fi
  if [[ -n "${WPA_MCP_BROWSER_TZ:-}" ]]; then
    if [[ -n "$PW_CONTEXT_OPTS" ]]; then
      PW_CONTEXT_OPTS="${PW_CONTEXT_OPTS}, "
    fi
    PW_CONTEXT_OPTS="${PW_CONTEXT_OPTS}\"timezoneId\": \"${WPA_MCP_BROWSER_TZ}\""
  fi

  cat > "$PW_CONFIG_PATH" <<EOF
{ "browser": { "contextOptions": { ${PW_CONTEXT_OPTS} } } }
EOF

  echo "entrypoint: generated playwright-mcp config at $PW_CONFIG_PATH (locale=${WPA_MCP_BROWSER_LANG:-<default>}, timezoneId=${WPA_MCP_BROWSER_TZ:-<default>})"
  PW_CONFIG_FLAG="--config $PW_CONFIG_PATH"
fi

# Observability: surface playwright-mcp output to the container's stdout
# (so `docker logs wpa-mcp` shows it) AND keep a local copy in
# /tmp/playwright-mcp.log. `> >(tee FILE)` uses process substitution so the
# subprocess's stdout/stderr fan out to both; `$!` still captures the
# playwright-mcp pid (not tee's). DEBUG=pw:browser* turns on Playwright's
# own page-crash / target-closed / disconnect events so a browser context
# dying mid-captive-portal is visible instead of silent. (pw:protocol* is
# omitted on purpose — it logs every CDP frame and drowns the signal.)
#
# NB: $PW_CONFIG_FLAG is intentionally unquoted so that when empty it
# expands to zero arguments, and when set it word-splits into two args
# (`--config` and the path). The path is hardcoded so word-splitting is
# safe; values from the env vars only appear inside the JSON, not the flag.
DEBUG="${WPA_MCP_PLAYWRIGHT_DEBUG:-pw:browser*}" \
playwright-mcp \
  --headless \
  --browser chromium \
  --no-sandbox \
  --allow-unrestricted-file-access \
  --output-dir "$PLAYWRIGHT_MCP_OUTPUT_DIR" \
  --port "${PLAYWRIGHT_MCP_PORT}" \
  --host 127.0.0.1 \
  $PW_CONFIG_FLAG \
  > >(tee /tmp/playwright-mcp.log) 2>&1 &
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
