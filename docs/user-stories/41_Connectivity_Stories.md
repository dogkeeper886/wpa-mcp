# Connectivity User Stories

**Status:** Draft
**Created:** 2026-04-10
**Source:** [src/tools/connectivity.ts](../../src/tools/connectivity.ts) | [02_Connectivity_Tools](../reference/02_Connectivity_Tools.md)

---

## US-NET-001: Ping a Host

**Tool:** network_ping | **Ref:** [02_Connectivity_Tools - network_ping](../reference/02_Connectivity_Tools.md#network_ping)

As a user, I want to ping a host so that I can check if it is reachable and measure latency.

### Acceptance Criteria

1. Ping reachable host returns alive=true with response time
2. Ping unreachable host returns alive=false
3. Packet count is configurable (default: 1)
4. Raw ping output is included in response
5. Invalid hostname returns informative error

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |

### Tags
`network`, `ping`, `diagnostics`

---

## US-NET-002: Check Internet Connectivity

**Tool:** network_check_internet | **Ref:** [02_Connectivity_Tools - network_check_internet](../reference/02_Connectivity_Tools.md#network_check_internet)

As a user, I want to check if the device has internet access so that I can verify connectivity after connecting to WiFi.

### Acceptance Criteria

1. Returns connected=true with latency when internet is available
2. Returns connected=false when no internet
3. Falls back through multiple check URLs (Google, Cloudflare, gstatic)
4. Works without any parameters

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`network`, `internet`, `diagnostics`

---

## US-NET-003: Detect Captive Portal

**Tool:** network_check_captive | **Ref:** [02_Connectivity_Tools - network_check_captive](../reference/02_Connectivity_Tools.md#network_check_captive)

As a user, I want to detect if I'm behind a captive portal so that I know I need to complete a login page.

### Acceptance Criteria

1. Returns is_captive=false when no portal (HTTP 204 received)
2. Returns is_captive=true with redirect_url when portal detected (HTTP 302/301)
3. Provides hint to use browser tools when portal detected
4. Works without any parameters

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`network`, `captive-portal`, `diagnostics`

---

## US-NET-004: DNS Lookup

**Tool:** network_dns_lookup | **Ref:** [02_Connectivity_Tools - network_dns_lookup](../reference/02_Connectivity_Tools.md#network_dns_lookup)

As a user, I want to perform a DNS lookup so that I can verify DNS resolution is working.

### Acceptance Criteria

1. Returns resolved IP addresses for valid hostname
2. Returns both IPv4 and IPv6 addresses when available
3. Returns error for unresolvable hostname (ENOTFOUND)
4. Returns error when DNS server is unreachable

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`network`, `dns`, `diagnostics`

---

## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-NET-001 | AC1-5 | — | No test |
| US-NET-002 | AC1-4 | — | No test |
| US-NET-003 | AC1-4 | — | No test |
| US-NET-004 | AC1-4 | — | No test |

**Coverage:** 0/17 ACs have test coverage.
