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

## 2. The correct approach: move wlan0 into container's netns

Linux lets you move a **physical** network interface into another network namespace. The interface disappears from the host and only exists inside the container. All IP, routes, DHCP stay inside.

```
  ┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
  │  HOST network namespace               │     │  CONTAINER network namespace           │
  │                                        │     │  (Docker default bridge or none)       │
  │  eth0: 10.0.0.50                       │     │                                        │
  │                                        │     │  wlan0: 192.168.1.42                   │
  │  ip route:                             │     │                                        │
  │    default via 10.0.0.1 dev eth0       │     │  ip route:                             │
  │    (no wlan0 — it's gone from here)    │     │    default via 192.168.1.1 dev wlan0   │
  │                                        │     │    (only WiFi routes, fully isolated)   │
  │  Host routing: UNAFFECTED              │     │                                        │
  └──────────────────────────────────────┘     └──────────────────────────────────────┘
                                                           │
                                                   wpa_supplicant
                                                   wpa_cli
                                                   dhclient
                                                   wpa-mcp (port 3000)
```

The kernel driver for the PCIe adapter still runs on the host. But the **network interface** (`wlan0`) only exists in the container's namespace. All WiFi traffic, DHCP leases, and routes are invisible to the host.

---

## 3. How to move wlan0 into a container

### Step 1: Start container (with its own netns, NOT --network host)

```bash
docker run --rm -d \
  --name wpa-mcp \
  --network none \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -e WIFI_INTERFACE=wlan0 \
  wpa-mcp
```

`--network none` gives the container its own empty network namespace. No bridge, no veth — just `lo`.

### Step 2: Get the container's PID

```bash
CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' wpa-mcp)
echo "Container PID: $CONTAINER_PID"
```

### Step 3: Move wlan0 from host into container's netns

```bash
# wlan0 disappears from host after this
sudo ip link set wlan0 netns $CONTAINER_PID
```

### Step 4: Verify — host no longer has wlan0

```bash
# Host: wlan0 is gone
$ ip link show wlan0
Device "wlan0" does not exist.

$ ip route
default via 10.0.0.1 dev eth0 proto static metric 100
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.50
# No wlan0 routes. Clean.
```

### Step 5: Verify — container has wlan0

```bash
$ docker exec wpa-mcp ip link show wlan0
4: wlan0: <BROADCAST,MULTICAST> mtu 1500 state DOWN
    link/ether aa:bb:cc:dd:ee:ff brd ff:ff:ff:ff:ff:ff

$ docker exec wpa-mcp ip route
# (empty or just lo — no routes until WiFi connects)
```

### Step 6: Container connects to WiFi (via MCP or manually)

Inside the container, wpa-mcp does its normal flow:

```bash
# Inside container:
$ ip link set wlan0 up
$ wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf
$ wpa_cli -i wlan0 status
wpa_state=INACTIVE

# After wifi_connect via MCP:
$ wpa_cli -i wlan0 status
wpa_state=COMPLETED
ip_address=192.168.1.42
ssid=CoffeeShop

$ ip route
default via 192.168.1.1 dev wlan0 proto dhcp metric 600
192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.42
```

### Step 7: Verify host is still clean

```bash
# Host:
$ ip route
default via 10.0.0.1 dev eth0 proto static metric 100
10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.50
# No wlan0. No WiFi routes. Host unaffected.
```

---

## 4. Full flow diagram

```
  MCP Client           Container (own netns)              Container's wlan0
  (Claude)              --network none                     (moved from host)
       │                       │                                  │
       │  POST /mcp            │                                  │
       │  wifi_connect(…)      │                                  │
       │──────────────────────►│                                  │
       │                       │  ip link set wlan0 up            │
       │                       │  wpa_supplicant -i wlan0         │
       │                       │  wpa_cli add/set/select_network  │
       │                       │─────────────────────────────────►│ associates
       │                       │  wpa_cli status → COMPLETED      │
       │                       │◄─────────────────────────────────│
       │                       │  dhclient wlan0                  │
       │                       │─────────────────────────────────►│ IP: 192.168.1.42
       │                       │                                  │ route: default via
       │                       │                                  │   192.168.1.1
       │                       │                                  │
       │                       │  (all routes inside container    │
       │                       │   namespace — host untouched)    │
       │                       │                                  │
       │  ◄────────────────────│  { success, ip: 192.168.1.42 }  │
       │                       │                                  │

  HOST routing table: unchanged. Only eth0 default route.
```

---

## 5. Route trace comparison

### --network host (broken)

```
  EVENT                    HOST ip route                              ISOLATED?
  ─────                    ──────────                                 ─────────
  before connect           default via 10.0.0.1 dev eth0             -
  after dhclient wlan0     default via 10.0.0.1 dev eth0 metric 100  NO
                           default via 192.168.1.1 dev wlan0 m 600   ← leaked
  after disconnect         default via 10.0.0.1 dev eth0             -
```

### --network none + ip link set netns (correct)

```
  EVENT                    HOST ip route                              ISOLATED?
  ─────                    ──────────                                 ─────────
  before connect           default via 10.0.0.1 dev eth0             -
  after dhclient wlan0     default via 10.0.0.1 dev eth0             YES
                           (wlan0 route only in container netns)
  after disconnect         default via 10.0.0.1 dev eth0             YES

  CONTAINER ip route:
  before connect           (empty)
  after dhclient wlan0     default via 192.168.1.1 dev wlan0         contained
  after disconnect         (empty)
```

---

## 6. MCP client connectivity

With `--network none`, the container has no bridge or veth to the host. The MCP client can't reach port 3000. Two solutions:

### Option A: Add a veth pair for MCP traffic only

```bash
# Create veth pair
sudo ip link add veth-host type veth peer name veth-container

# Move one end into the container
sudo ip link set veth-container netns $CONTAINER_PID

# Assign IPs
sudo ip addr add 172.30.0.1/30 dev veth-host
sudo ip link set veth-host up

docker exec wpa-mcp ip addr add 172.30.0.2/30 dev veth-container
docker exec wpa-mcp ip link set veth-container up

# MCP client connects to http://172.30.0.1:3000/mcp
# But port 3000 is bound inside the container on 172.30.0.2
# So the MCP client uses: http://172.30.0.2:3000/mcp
```

MCP traffic goes over the veth. WiFi traffic goes over wlan0. Completely separate paths.

### Option B: Use Docker bridge (simpler)

```bash
docker run --rm -d \
  --name wpa-mcp \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -p 3000:3000 \
  -e WIFI_INTERFACE=wlan0 \
  wpa-mcp

# Then move wlan0 in
CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' wpa-mcp)
sudo ip link set wlan0 netns $CONTAINER_PID
```

Docker's default bridge handles MCP traffic (port 3000 forwarded). wlan0 is isolated in the container's netns. WiFi routes don't leak because the bridge is a separate interface.

```
  ┌───────────────────────────────┐     ┌────────────────────────────────┐
  │  HOST                          │     │  CONTAINER                      │
  │                                │     │                                 │
  │  eth0: 10.0.0.50              │     │  eth0: 172.17.0.2  (bridge)    │
  │  docker0: 172.17.0.1          │     │  wlan0: 192.168.1.42 (WiFi)   │
  │                                │     │                                 │
  │  ip route:                     │     │  ip route:                      │
  │    default via 10.0.0.1 eth0   │────►│    default via 192.168.1.1     │
  │    172.17.0.0/16 dev docker0   │     │      dev wlan0 (WiFi traffic)  │
  │                                │     │    172.17.0.0/16 dev eth0      │
  │  No wlan0. No WiFi routes.    │     │      (MCP traffic to host)      │
  └───────────────────────────────┘     └────────────────────────────────┘
       ▲                                         ▲
       │ host:3000 forwarded                     │ wlan0 (WiFi, isolated)
       │ to container:3000                       │
  MCP Client                              WiFi network (CoffeeShop)
```

---

## 7. Returning wlan0 to the host (cleanup)

When the container stops or you're done:

```bash
# From inside the container (before stopping):
docker exec wpa-mcp ip link set wlan0 down

# Or after the container exits, the interface automatically
# returns to the host's default network namespace.

# Verify on host:
$ ip link show wlan0
4: wlan0: <BROADCAST,MULTICAST> mtu 1500 state DOWN
```

When a container is removed, any interfaces that were moved into its namespace return to the host automatically.

---

## 8. Example: full script

```bash
#!/bin/bash
set -e

IFACE=${1:-wlan0}

# 1. Ensure interface exists on host
ip link show "$IFACE" > /dev/null 2>&1 || { echo "$IFACE not found"; exit 1; }

# 2. Make sure NM isn't managing it
sudo nmcli device set "$IFACE" managed no 2>/dev/null || true

# 3. Start container (bridge network for MCP, own netns for WiFi)
docker run --rm -d \
  --name wpa-mcp \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  -p 3000:3000 \
  -e WIFI_INTERFACE="$IFACE" \
  -v /etc/wpa_supplicant:/etc/wpa_supplicant:ro \
  wpa-mcp

# 4. Move WiFi interface into container
CONTAINER_PID=$(docker inspect --format '{{.State.Pid}}' wpa-mcp)
sudo ip link set "$IFACE" netns "$CONTAINER_PID"

echo "wlan0 moved into container (PID $CONTAINER_PID)"
echo "Host routing: unaffected"
echo "MCP endpoint: http://localhost:3000/mcp"
echo ""
echo "Verify:"
echo "  Host:      ip route  (no wlan0)"
echo "  Container: docker exec wpa-mcp ip route"
```

---

## Document index

- [00 Architecture](./00_Architecture.md) – Component responsibilities and details
- [docs README](./README.md) – User flow, features, quick start
