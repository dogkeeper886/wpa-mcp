# Troubleshooting

**Updated:** 2026-02-06

---

## Docker / Container Issues

### `ip link set netns` returns "The interface netns is immutable"

Many WiFi drivers (notably **iwlwifi** for Intel adapters) block moving the
network interface directly into another namespace.

**Fix:** Move the phy device instead of the interface:

```bash
# Find the phy name
cat /sys/class/net/wlp6s0/phy80211/name
# e.g. phy0

# Move the phy (interface follows automatically)
sudo iw phy phy0 set netns $CONTAINER_PID
```

This works because `iw phy set netns` operates at the wireless subsystem level,
bypassing the network interface layer restriction.

---

### NetworkManager re-manages interface after container stop

When the container stops, the phy returns to the host. NetworkManager sees a
"new" unmanaged interface and re-manages it, which can interfere with future
container starts.

**Temporary fix:**

```bash
sudo nmcli device set wlp6s0 managed no
```

**Persistent fix:**

```bash
sudo make nm-unmanage WIFI_INTERFACE=wlp6s0
```

This creates `/etc/NetworkManager/conf.d/99-unmanaged-wlp6s0.conf` which
survives reboots and interface reappearance. To undo:

```bash
sudo make nm-restore WIFI_INTERFACE=wlp6s0
```

---

### dhclient does not add WiFi default route

After WiFi connect inside the container, `ip route` shows the WiFi subnet
route but no default route. This happens when the Docker bridge default route
still exists — dhclient sees an existing default and only adds a subnet route.

**Fix:** The Docker entrypoint script (`scripts/docker-entrypoint.sh`) deletes
the bridge default route on startup automatically. If you're running the
container without the entrypoint, manually delete it before connecting:

```bash
docker exec wpa-mcp sudo ip route del default
```

---

### wpa_cli returns "Failed to connect to non-global ctrl_ifname"

Inside the container, wpa_cli cannot find the control socket.

**Cause:** The wpa_supplicant.conf must include `GROUP=node` (or the group the
node user belongs to) in the `ctrl_interface` directive:

```
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=node
```

The Dockerfile sets this automatically. If you override the config, ensure the
GROUP is correct.

---

### Host wpa_supplicant conflicts with container

If a wpa_supplicant process on the host is bound to the same interface (`-i wlp6s0`),
it will conflict with the container's wpa_supplicant after the phy is moved.

**Fix:** Stop the host wpa_supplicant before starting the container:

```bash
sudo pkill -f 'wpa_supplicant.*-i.*wlp6s0'
# Or if managed by systemd:
sudo systemctl stop wpa_supplicant
```

The `docker-run.sh` script checks for this automatically and exits with an
error if a conflict is detected.

---

## DNS Issues

### DNS resolution fails after WiFi connection (systemd-resolved)

**Date:** 2026-02-01 | **Severity:** High | **Status:** Workaround Available

After connecting to WiFi, DNS resolution fails. `ping 8.8.8.8` works but
`ping google.com` does not.

**Environment:** Fedora with systemd-resolved, running wpa-mcp directly on host
(not in Docker container).

**Root cause:** dhclient obtains DNS servers from DHCP but does not notify
systemd-resolved. The WiFi interface has no DNS scope:

```bash
$ resolvectl status wlp7s0
Link 4 (wlp7s0)
    Current Scopes: LLMNR/IPv4 LLMNR/IPv6    # No "DNS" scope
         Protocols: -DefaultRoute             # Not default route for DNS
```

**Fix:** Manually configure DNS for the interface:

```bash
sudo resolvectl dns wlp7s0 192.168.3.1
```

**Verification:**

```bash
$ resolvectl status wlp7s0
Link 4 (wlp7s0)
    Current Scopes: DNS LLMNR/IPv4 LLMNR/IPv6
         Protocols: +DefaultRoute
       DNS Servers: 192.168.3.1
```

**Note:** This fix is not persistent across disconnect/reconnect. wpa-mcp
includes automatic DNS fallback configuration — if DHCP times out or does not
configure DNS, it runs `resolvectl` with the gateway IP.

**Related:**
- dhclient exit hooks don't work when dhclient is invoked directly by wpa-mcp
- NetworkManager handles this automatically but is excluded for wpa_supplicant control
- Firefox may need DoH disabled (`network.trr.mode = 5`) to use system DNS
