# Connectivity Tools

**Status:** Complete  
**Updated:** 2026-01-14

---

## Goal

This document provides a complete reference for network connectivity diagnostic tools, including ping, DNS lookup, internet connectivity checks, and captive portal detection.

---

## Tools Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Connectivity Tools                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Basic Diagnostics              Advanced Checks                 │
│  ─────────────────              ───────────────                 │
│  network_ping                   network_check_internet          │
│  network_dns_lookup             network_check_captive           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  WiFi Connected Successfully                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               network_check_internet                            │
│           "Do we have internet access?"                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
      ┌───────────────┐               ┌───────────────┐
      │   Connected   │               │  No Internet  │
      │   to Internet │               │               │
      └───────────────┘               └───────┬───────┘
                                              │
                                              ▼
                              ┌───────────────────────────────────┐
                              │       network_check_captive       │
                              │     "Is there a login page?"      │
                              └───────────────┬───────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                              ▼                               ▼
                      ┌───────────────┐               ┌───────────────┐
                      │ Portal Found  │               │  No Portal    │
                      │ Redirect URL  │               │ Check DNS/    │
                      │ returned      │               │ Gateway       │
                      └───────┬───────┘               └───────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │browser_run_   │
                      │    script     │
                      │ (automate     │
                      │  login)       │
                      └───────────────┘
```

---

## Basic Diagnostics

### network_ping

Ping a host to check network reachability.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| host | string | Yes | Hostname or IP address |
| count | number | No | Number of ping packets (default: 4) |

**Example:**
```json
{
  "host": "8.8.8.8",
  "count": 3
}
```

**Response (Success):**
```json
{
  "success": true,
  "host": "8.8.8.8",
  "alive": true,
  "time": 12.5,
  "output": "PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.\n64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=12.3 ms\n64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=12.5 ms\n64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=12.7 ms\n\n--- 8.8.8.8 ping statistics ---\n3 packets transmitted, 3 received, 0% packet loss, time 2003ms\nrtt min/avg/max/mdev = 12.3/12.5/12.7/0.163 ms"
}
```

**Response (Failure):**
```json
{
  "success": true,
  "host": "192.168.99.99",
  "alive": false,
  "output": "PING 192.168.99.99 (192.168.99.99) 56(84) bytes of data.\n\n--- 192.168.99.99 ping statistics ---\n3 packets transmitted, 0 received, 100% packet loss, time 2042ms"
}
```

**Use Cases:**
- Verify gateway connectivity
- Test DNS server reachability
- Diagnose network path issues
- Measure latency

---

### network_dns_lookup

Perform DNS resolution for a hostname.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| hostname | string | Yes | Hostname to resolve |

**Example:**
```json
{
  "hostname": "google.com"
}
```

**Response:**
```json
{
  "success": true,
  "hostname": "google.com",
  "addresses": [
    "142.250.80.46",
    "2607:f8b0:4004:800::200e"
  ]
}
```

**Response (Failure):**
```json
{
  "success": false,
  "hostname": "nonexistent.invalid",
  "error": "DNS lookup failed: ENOTFOUND"
}
```

**Use Cases:**
- Verify DNS server is working
- Debug DNS resolution issues
- Check if specific domains resolve
- Compare IPv4 vs IPv6 resolution

---

## Advanced Checks

### network_check_internet

Check if the device has internet connectivity.

**Parameters:** None

**Example:**
```json
{}
```

**Response (Connected):**
```json
{
  "success": true,
  "connected": true,
  "latency_ms": 45,
  "check_url": "https://www.google.com/generate_204"
}
```

**Response (No Internet):**
```json
{
  "success": true,
  "connected": false,
  "error": "All connectivity checks failed"
}
```

**How It Works:**

The tool attempts to reach multiple well-known connectivity check endpoints:

```
┌─────────────────────────────────────────────────────────────────┐
│                  Internet Connectivity Check                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Try: https://www.google.com/generate_204                    │
│     Expected: HTTP 204 No Content                               │
│                     │                                           │
│          Success ───┴─── Failure                                │
│             │               │                                   │
│             ▼               ▼                                   │
│       Return true    2. Try: cloudflare.com/cdn-cgi/trace      │
│                             │                                   │
│                  Success ───┴─── Failure                        │
│                     │               │                           │
│                     ▼               ▼                           │
│               Return true    3. Try: gstatic.com               │
│                                     │                           │
│                          Success ───┴─── Failure                │
│                             │               │                   │
│                             ▼               ▼                   │
│                       Return true     Return false              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- Post-connection verification
- Network troubleshooting
- Automated health checks

---

### network_check_captive

Detect if the device is behind a captive portal (hotel/airport/coffee shop login page).

**Parameters:** None

**Example:**
```json
{}
```

**Response (No Portal):**
```json
{
  "success": true,
  "is_captive": false,
  "message": "No captive portal detected"
}
```

**Response (Portal Detected):**
```json
{
  "success": true,
  "is_captive": true,
  "redirect_url": "http://login.hotelwifi.com/portal?mac=aa:bb:cc:dd:ee:ff",
  "message": "Captive portal detected"
}
```

**How It Works:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  Captive Portal Detection                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Request: http://connectivitycheck.gstatic.com/generate_204     │
│  (Must use HTTP, not HTTPS - captive portals intercept HTTP)   │
│                     │                                           │
│                     ▼                                           │
│          ┌─────────────────────┐                               │
│          │ Check Response Code │                               │
│          └──────────┬──────────┘                               │
│                     │                                           │
│     ┌───────────────┼───────────────┐                          │
│     │               │               │                          │
│     ▼               ▼               ▼                          │
│  HTTP 204      HTTP 302/301    Connection                      │
│  No Content    Redirect        Failed                          │
│     │               │               │                          │
│     ▼               ▼               ▼                          │
│  No Portal     Portal Found    Network Error                   │
│               (return URL)                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Use Cases:**
- Detect login pages after WiFi connection
- Automate captive portal handling
- Network provisioning workflows

---

## Diagnostic Workflow

### Complete Network Diagnostic Sequence

```
┌─────────────────────────────────────────────────────────────────┐
│              Recommended Diagnostic Sequence                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. wifi_status                                                 │
│     └─► Verify WiFi is COMPLETED state                         │
│                                                                 │
│  2. network_ping (gateway)                                      │
│     └─► Test local network connectivity                        │
│                                                                 │
│  3. network_dns_lookup                                          │
│     └─► Verify DNS resolution works                            │
│                                                                 │
│  4. network_ping (8.8.8.8)                                      │
│     └─► Test internet via IP (bypass DNS)                      │
│                                                                 │
│  5. network_check_internet                                      │
│     └─► Full connectivity verification                         │
│                                                                 │
│  6. network_check_captive (if no internet)                      │
│     └─► Check for login page                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Troubleshooting Guide

| Symptom | Check | Likely Cause |
|---------|-------|--------------|
| No gateway ping | wifi_status | WiFi not connected |
| Gateway ping OK, no DNS | network_dns_lookup | DNS server issue |
| DNS OK, no ping to IP | network_ping 8.8.8.8 | Firewall blocking |
| All OK, no HTTP | network_check_captive | Captive portal |
| Portal detected | browser_run_script | Need to login |

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| ENETUNREACH | No network route | Check WiFi connection |
| EHOSTUNREACH | Host not reachable | Check if host is online |
| ENOTFOUND | DNS resolution failed | Check DNS settings |
| ETIMEDOUT | Request timeout | Network congestion |

### Error Response Format

```json
{
  "success": false,
  "error": "Ping failed: Network is unreachable",
  "host": "8.8.8.8"
}
```

---

## Implementation Details

### Timeout Configuration

| Check | Default Timeout |
|-------|-----------------|
| Ping | 10 seconds total |
| DNS lookup | 5 seconds |
| Internet check | 10 seconds per URL |
| Captive portal | 5 seconds |

### External Dependencies

| Tool | System Command | Purpose |
|------|----------------|---------|
| Ping | `ping -c N host` | ICMP reachability |
| DNS | Node.js dns.lookup | DNS resolution |
| HTTP | Node.js http/https | Web requests |

---

## Related Documents

- [00_Architecture.md](./00_Architecture.md) - System architecture
- [01_WiFi_Tools.md](./01_WiFi_Tools.md) - WiFi tools
- [03_Browser_Tools.md](./03_Browser_Tools.md) - Browser automation for captive portals
