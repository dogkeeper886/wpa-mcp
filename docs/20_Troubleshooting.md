# Problem Report: DNS Resolution Fails After WiFi Connection

**Date:** 2026-02-01
**Severity:** High
**Status:** Workaround Available

---

## Problem Summary

After connecting to a WiFi network using wpa-mcp, DNS resolution fails. Applications (Firefox, curl) cannot resolve domain names even though IP connectivity works.

---

## Environment

- **OS:** Fedora (systemd-resolved manages DNS)
- **WiFi Interface:** wlp7s0
- **DNS Manager:** systemd-resolved
- **DHCP Client:** dhclient (invoked by wpa-mcp)

---

## Symptoms

1. WiFi connects successfully via wpa_supplicant
2. DHCP assigns IP address via dhclient
3. `ping 8.8.8.8` works (IP connectivity OK)
4. `ping google.com` fails (DNS fails)
5. Firefox cannot load captive portal pages
6. `/etc/resolv.conf` shows correct DNS but resolution still fails

---

## Root Cause Analysis

### Finding 1: systemd-resolved ignores /etc/resolv.conf

On systems using systemd-resolved, `/etc/resolv.conf` is a symlink to the stub resolver. The actual DNS configuration is managed per-interface by systemd-resolved.

### Finding 2: dhclient does not update systemd-resolved

When wpa-mcp runs `dhclient wlp7s0`, the DHCP response includes DNS servers, but dhclient does not pass this information to systemd-resolved.

### Finding 3: Interface has no DNS scope

```bash
$ resolvectl status wlp7s0

Link 4 (wlp7s0)
    Current Scopes: LLMNR/IPv4 LLMNR/IPv6    # <-- No "DNS" scope
         Protocols: -DefaultRoute             # <-- Not default route for DNS
```

The WiFi interface was not configured as a DNS source, so systemd-resolved never used it for resolution.

---

## Solution

Manually configure DNS for the interface using `resolvectl`:

```bash
sudo resolvectl dns wlp7s0 192.168.3.1
```

### Verification

```bash
$ resolvectl status wlp7s0

Link 4 (wlp7s0)
    Current Scopes: DNS LLMNR/IPv4 LLMNR/IPv6    # <-- Now includes "DNS"
         Protocols: +DefaultRoute                 # <-- Now default route
       DNS Servers: 192.168.3.1                   # <-- DNS configured
```

DNS resolution now works.

---

## Limitation

This fix is **not persistent**. The `resolvectl dns` setting is lost on:
- WiFi disconnect/reconnect
- Reboot
- Interface restart

---

## Recommended Fix

Modify wpa-mcp to run `resolvectl` after `dhclient` completes:

```bash
dhclient wlp7s0 && resolvectl dns wlp7s0 <gateway_ip>
```

The gateway IP can be extracted from:
- DHCP response
- `ip route show default`

---

## Related

- dhclient exit hooks (`/etc/dhcp/dhclient-exit-hooks.d/`) do not work when dhclient is invoked directly by wpa-mcp
- NetworkManager handles this automatically but is excluded to allow wpa_supplicant control
- Firefox may also need DoH disabled (`network.trr.mode = 5`) to use system DNS
