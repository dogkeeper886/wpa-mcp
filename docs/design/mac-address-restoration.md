# MAC Address Restoration for Docker Environments

## Problem Statement

When `iw phy set netns` moves a WiFi physical device into a Docker container's network namespace, the Linux kernel assigns a locally-administered MAC address (e.g., `42:1b:76:f1:ee:ab`) instead of the permanent hardware MAC (e.g., `a0:b3:39:fd:0a:e3`).

This means `mac_mode: "device"` in wpa_supplicant (which uses `mac_addr=0`) correctly uses the "device" MAC — but the device MAC is already wrong. For environments that rely on MAC-based RADIUS authentication, users need the real hardware MAC so they can register it once with the RADIUS server.

## Investigation

- The root cause is **not** wpa_supplicant — it's the kernel assigning a non-permanent MAC when the interface appears in the container namespace.
- `ip link show <iface>` exposes the real hardware MAC via `permaddr`:
  ```
  5: wlan0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 ...
      link/ether 42:1b:76:f1:ee:ab brd ff:ff:ff:ff:ff:ff
      permaddr a0:b3:39:fd:0a:e3
  ```
- The permanent MAC can be restored via `ip link set` before wpa_supplicant connects.

## Solution

### Reading the Permanent MAC

At daemon startup (`WpaDaemon.start()`), after bringing the interface up, we read and store the permanent MAC using `ip link show` to parse `permaddr`. If `permaddr` is unavailable (e.g., virtual interfaces), we fall back to the current interface MAC from `/sys/class/net/<iface>/address`.

### Restoring Before Connection

Before each connection in device mode (explicit `mac_mode: "device"` or no `mac_mode` specified), a `restoreDeviceMac()` helper:

1. Checks if the current interface MAC differs from the stored permanent MAC
2. If different: stops wpa_supplicant, sets the permanent MAC via `ip link set`, restarts wpa_supplicant
3. If the same: no-op (fast path)

This runs in the `wifi_connect`, `wifi_connect_eap`, `wifi_connect_tls`, and `wifi_hs20_connect` tool handlers.

### Setting the MAC

Setting a MAC address requires the interface to be down:
```
sudo ip link set <iface> down
sudo ip link set <iface> address <mac>
sudo ip link set <iface> up
```

On failure, the interface is always brought back up to avoid leaving it in a down state.

## Key Decisions

### Why restore at connection time, not at startup?

The user may switch between `mac_mode: "random"` and `mac_mode: "device"` across connections. Restoring only when device mode is requested avoids interfering with randomization modes.

### Why stop/start wpa_supplicant?

`ip link set address` requires the interface to be down. wpa_supplicant holds the interface, so it must be stopped first. The daemon is restarted immediately after.

### Why is this non-fatal?

MAC restoration failure should not prevent connection attempts. The user may still connect with the kernel-assigned MAC. Errors are logged for debugging.

### Why not use `mac_mode: "specific"` instead?

Users shouldn't have to look up and hardcode their permanent MAC. Device mode should "just work" — using the real hardware MAC regardless of what the kernel initially assigned.

## Files Modified

| File | Changes |
|---|---|
| `src/lib/mac-utils.ts` | Added `readInterfaceMac()`, `readPermanentMac()`, `setInterfaceMac()` |
| `src/lib/wpa-daemon.ts` | Added `permanentMac` property, captured in `start()`, added `getPermanentMac()` |
| `src/tools/wifi.ts` | Added `restoreDeviceMac()` helper, called in 4 connection handlers |
