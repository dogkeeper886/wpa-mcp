# MAC Randomization Workaround

**Date:** 2026-02-11 | **Status:** Workaround Available

---

## Problem

When connecting with `mac_mode: "device"` after a previous connection used MAC randomization, the WiFi interface retains the randomized MAC address. The wpa_supplicant `mac_addr=0` (device mode) setting is correctly written to the network config but does not reset an already-randomized interface MAC.

**Symptom:** The connection uses a randomized MAC despite `mac_mode: "device"`, causing RADIUS MAC-based authentication to fail with `Access-Reject` because the username (client MAC) doesn't match the registered user.

**Example:**

```
# wpa_supplicant.conf shows correct config:
network={
    ssid="fqdn test mac auth"
    key_mgmt=OWE
    ieee80211w=2
    mac_addr=0          # device mode - should use real MAC
}

# But ip link shows randomized MAC:
$ ip link show wlp6s0
    link/ether 9e:3f:66:c3:cd:2e brd ff:ff:ff:ff:ff:ff permaddr a0:b3:39:fd:0b:06
```

**Root cause:** wpa_supplicant's `mac_addr=0` controls MAC behavior for *new* associations, but once the kernel/driver has randomized the interface-level MAC, it is not reverted automatically.

---

## Workaround

Manually reset the interface MAC to the permanent hardware address before connecting:

```bash
docker exec wpa-mcp sudo ip link set wlp6s0 down
docker exec wpa-mcp sudo ip link set wlp6s0 address <PERMANENT_MAC>
docker exec wpa-mcp sudo ip link set wlp6s0 up
```

To find the permanent MAC:

```bash
$ docker exec wpa-mcp ip link show wlp6s0
    link/ether 9e:3f:66:c3:cd:2e brd ff:ff:ff:ff:ff:ff permaddr a0:b3:39:fd:0b:06
#                                                        ^^^^^^^^^^^^^^^^^^^^^^^^
#                                                        This is the real MAC
```

Alternatively, restart the container (`sudo make restart`) to get a fresh interface with the real MAC.

---

## RADIUS MAC Auth Setup

For MAC-based authentication, the RADIUS username must match the client's MAC in uppercase dash-separated format:

```
# Permanent MAC: a0:b3:39:fd:0b:06
# RADIUS username: A0-B3-39-FD-0B-06
```

---

## Full Connection Example

```bash
# 1. Reset interface MAC (if previously randomized)
docker exec wpa-mcp sudo ip link set wlp6s0 down
docker exec wpa-mcp sudo ip link set wlp6s0 address a0:b3:39:fd:0b:06
docker exec wpa-mcp sudo ip link set wlp6s0 up

# 2. Connect with OWE + device MAC
# wifi_connect with: ssid, security_type="owe", mac_mode="device"

# 3. Verify RADIUS accepted the real MAC in auth logs
```
