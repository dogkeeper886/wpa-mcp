# Docker Approach: wpa-mcp with PCIe WiFi

**Updated:** 2026-02-06

---

## Goal

Run wpa-mcp in a Docker container with a PCIe wireless adapter as an **isolated WiFi client**. The WiFi network must be fully contained — its IP, routes, and DHCP must NOT touch the host routing table.

---

## 1. Why --network host fails

With `--network host`, the container shares the host's network namespace. Every route change is visible to the host:

```
  --network host (BROKEN for isolation)

  ┌────────────────────────────────────────────────────────┐
  │  HOST + CONTAINER (same network namespace)              │
  │                                                         │
  │  eth0: 10.0.0.50        ← host's wired connection      │
  │  wlan0: 192.168.1.42    ← WiFi, managed by container   │
  │                                                         │
  │  ip route:                                              │
  │    default via 10.0.0.1  dev eth0   metric 100          │
  │    default via 192.168.1.1 dev wlan0 metric 600  ← !!  │
  │                                                         │
  │  Problem: WiFi route pollutes host routing table.       │
  │  If eth0 goes down, host traffic goes over wlan0.       │
  │  Not isolated. Useless as a separate test network.      │
  └────────────────────────────────────────────────────────┘
```

---

## 2. The correct approach: move the phy into container's netns

Linux lets you move a **wireless phy device** into another network namespace using
`iw phy`. The WiFi interface disappears from the host and only exists inside the
container. All IP, routes, DHCP stay inside.

**Important:** `ip link set <iface> netns` does NOT work with most WiFi drivers
(e.g. iwlwifi returns "The interface netns is immutable"). You must use
`iw phy <phyN> set netns <pid>` instead, which moves the underlying phy device.

```
  ┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
  │  HOST network namespace               │     │  CONTAINER network namespace           │
  │                                        │     │  (Docker bridge, default removed)      │
  │  eth0: 10.0.0.50                       │     │                                        │
  │                                        │     │  eth0: 172.17.0.2  (bridge, no default)│
  │  ip route:                             │     │  wlan0: 192.168.1.42                   │
  │    default via 10.0.0.1 dev eth0       │     │                                        │
  │    172.17.0.0/16 dev docker0           │     │  ip route:                             │
  │    (no wlan0 — phy moved out)          │     │    default via 192.168.1.1 dev wlan0   │
  │                                        │     │    172.17.0.0/16 dev eth0 (MCP only)   │
  │  Host routing: UNAFFECTED              │     │    192.168.1.0/24 dev wlan0            │
  └──────────────────────────────────────┘     └──────────────────────────────────────┘
       ▲                                                │
       │ host:3000 → container:3000                     │
       │ (via Docker bridge subnet)                     │
  MCP Client                                    wpa_supplicant + wpa_cli
                                                dhclient + wpa-mcp server
```

The kernel driver for the PCIe adapter still runs on the host. But the **phy and its
interface** only exist in the container's namespace. All WiFi traffic, DHCP leases,
and routes are invisible to the host.

---

## 3. How to set up

### Prerequisites on the host

```bash
# 1. Find your WiFi interface and its phy
ip link show | grep -E "^[0-9]+: wl"
# e.g.  3: wlp6s0: ...

cat /sys/class/net/wlp6s0/phy80211/name
# e.g.  phy0

# 2. Tell NetworkManager to ignore it (if NM is running)
sudo nmcli device set wlp6s0 managed no

# 3. Bring interface down
sudo ip link set wlp6s0 down
```

### Step 1: Start container (Docker bridge for MCP, own netns for WiFi)

```bash
docker run --rm -d \
  --name wpa-mcp \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -p 3000:3000 \
  -e WIFI_INTERFACE=wlp6s0 \
  wpa-mcp
```

Docker bridge gives the container a subnet route (`172.17.0.0/16 dev eth0`) and
a default route. Port 3000 is forwarded so the MCP client can reach the server.

### Step 2: Get the container's PID

```bash
CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' wpa-mcp)
```

### Step 3: Move phy into container's netns

```bash
# Move the phy device (NOT the interface) — works with all WiFi drivers
sudo iw phy phy0 set netns $CONTAINER_PID
```

The WiFi interface disappears from the host and reappears inside the container
(it may keep the same name or get renamed).

### Step 4: Remove Docker bridge default route

```bash
# Wait for server to be ready
curl -sf http://localhost:3000/health

# Delete bridge default so dhclient adds WiFi as the only default
docker exec wpa-mcp sudo ip route del default
```

Without this step, dhclient sees the existing bridge default and only adds a
subnet route for WiFi. Deleting it first ensures WiFi becomes the sole default.

### Step 5: Verify — host is clean, container has WiFi

```bash
# Host: interface gone, routes untouched
$ ip link show wlp6s0
Device "wlp6s0" does not exist.

$ ip route
default via 10.0.0.1 dev eth0 proto static metric 100
172.17.0.0/16 dev docker0 ...
# No wlp6s0 routes.

# Container: WiFi interface present, no default yet (until connect)
$ docker exec wpa-mcp ip link show wlp6s0
3: wlp6s0: <BROADCAST,MULTICAST> mtu 1500 state DOWN ...

$ docker exec wpa-mcp ip route
172.17.0.0/16 dev eth0 proto kernel scope link src 172.17.0.2
# Bridge subnet only, no default.
```

### Step 6: Connect to WiFi via MCP

```bash
# Scan
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"wifi_scan","arguments":{}}}'

# Connect
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"wifi_connect",
                 "arguments":{"ssid":"MyNetwork","password":"secret"}}}'
```

### Step 7: Verify — WiFi is the only default, host still clean

```bash
# Container: WiFi is sole default route
$ docker exec wpa-mcp ip route
default via 192.168.4.1 dev wlp6s0                          ← WiFi default
172.17.0.0/16 dev eth0 proto kernel scope link src 172.17.0.2  ← MCP subnet
192.168.4.0/24 dev wlp6s0 proto kernel scope link src 192.168.4.130

# Host: unchanged
$ ip route
default via 10.0.0.1 dev eth0 proto static metric 100
172.17.0.0/16 dev docker0 ...
# No wlp6s0. No WiFi routes.
```

---

## 4. Full flow diagram

```
  MCP Client           Container (own netns)             Container's wlp6s0
  (Claude)              Docker bridge + WiFi              (phy moved from host)
       │                       │                                  │
       │  POST /mcp            │                                  │
       │  wifi_connect(…)      │                                  │
       │──────────────────────►│                                  │
       │  (via bridge subnet)  │                                  │
       │                       │  ip link set wlp6s0 up           │
       │                       │  wpa_supplicant -i wlp6s0        │
       │                       │  wpa_cli add/set/select_network  │
       │                       │─────────────────────────────────►│ associates
       │                       │  wpa_cli status → COMPLETED      │
       │                       │◄─────────────────────────────────│
       │                       │  dhclient wlp6s0                 │
       │                       │─────────────────────────────────►│ IP: 192.168.4.130
       │                       │                                  │ default via
       │                       │                                  │   192.168.4.1
       │                       │                                  │
       │                       │  Container routes:               │
       │                       │    default via 192.168.4.1       │
       │                       │      dev wlp6s0 (WiFi only)     │
       │                       │    172.17.0.0/16 dev eth0        │
       │                       │      (bridge subnet, MCP only)   │
       │                       │                                  │
       │  ◄────────────────────│  { success, ip: 192.168.4.130 } │
       │                       │                                  │

  HOST routing table: unchanged. Only eth0 default route.
  WiFi traffic: contained entirely inside container netns.
  MCP traffic: Docker bridge subnet (172.17.0.x).
```

---

## 5. Route trace

```
  EVENT                  HOST ip route              CONTAINER ip route         ISOLATED?
  ─────                  ──────────                 ──────────────────         ─────────
  container starts       default via … dev eth0     default via 172.17.0.1     -
                         172.17.0.0/16 docker0        dev eth0 (bridge)
                                                    172.17.0.0/16 dev eth0

  phy moved in           (unchanged)                172.17.0.0/16 dev eth0    YES
                                                    (wlp6s0 appears, DOWN)

  bridge default         (unchanged)                172.17.0.0/16 dev eth0    YES
  deleted                                           (no default route)

  wifi_connect +         (unchanged)                default via 192.168.4.1   YES
  dhclient                                            dev wlp6s0 (WiFi)
                                                    172.17.0.0/16 dev eth0
                                                    192.168.4.0/24 dev wlp6s0

  wifi_disconnect        (unchanged)                172.17.0.0/16 dev eth0    YES
                                                    (WiFi routes removed)

  container stops        default via … dev eth0     (gone)                    YES
                         (phy returns to host)
```

---

## 6. Why `ip link set netns` fails (and `iw phy` works)

Many WiFi drivers (notably **iwlwifi** for Intel adapters) set the interface's
netns as immutable:

```bash
$ sudo ip link set wlp6s0 netns $PID
Error: The interface netns is immutable.
```

The fix is to move the **phy device**, not the interface:

```bash
# Find the phy name
$ cat /sys/class/net/wlp6s0/phy80211/name
phy0

# Move the phy (interface follows automatically)
$ sudo iw phy phy0 set netns $PID
```

This works because `iw phy set netns` operates at the wireless subsystem level,
bypassing the network interface layer restriction.

---

## 7. Returning the phy to the host (cleanup)

When the container stops, the phy and its interface automatically return to the
host's default network namespace:

```bash
# Stop container
docker rm -f wpa-mcp

# Wait a moment, then verify
$ ip link show wlp6s0
3: wlp6s0: <BROADCAST,MULTICAST> mtu 1500 state DOWN ...
```

---

## 8. Helper script

See `scripts/docker-run.sh` for a complete script that:
1. Resolves the phy from the interface name
2. Sets NetworkManager to unmanaged
3. Starts the container with bridge network + port forwarding
4. Moves the phy into the container
5. Waits for the server, then deletes the bridge default route

Usage:

```bash
sudo ./scripts/docker-run.sh wlp6s0
```

---

## 9. Integration test

See `tests/integration/test-docker-netns.sh` for a 5-phase test:

1. **Setup** — record baseline routes, build image, start container, move phy
2. **Pre-connect isolation** — verify interface gone from host, routes unchanged
3. **WiFi connect via MCP** — scan, connect, verify IP assigned
4. **Post-connect isolation** — host routes unchanged, WiFi is sole default in container, ping works
5. **Disconnect + cleanup** — disconnect, stop container, verify phy returns, routes restored

Run:

```bash
sudo make test-integration TEST_SSID="MyNetwork" TEST_PSK="password" WIFI_INTERFACE=wlp6s0
```

---

## Document index

- [00 Architecture](./00_Architecture.md) – Component responsibilities and details
- [docs README](./README.md) – User flow, features, quick start
