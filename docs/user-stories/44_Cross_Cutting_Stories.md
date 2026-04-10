# Cross-Cutting User Stories

**Status:** Draft
**Created:** 2026-04-10
**Source:** [src/lib/mac-utils.ts](../../src/lib/mac-utils.ts) | [mac-address-restoration](../design/mac-address-restoration.md) | [05_Docker_Netns_Isolation](../reference/05_Docker_Netns_Isolation.md)

---

## US-MAC-001: MAC Address Privacy

**Tools:** wifi_connect, wifi_connect_eap, wifi_connect_tls, wifi_hs20_connect | **Ref:** [01_WiFi_Tools - MAC Modes](../reference/01_WiFi_Tools.md#wifi_connect)

As a user, I want to control my MAC address per connection so that I can protect my privacy or use my real MAC when required.

### Acceptance Criteria

1. mac_mode="random" uses a new random MAC for each connection
2. mac_mode="persistent-random" uses the same random MAC across reboots
3. mac_mode="device" uses the real hardware MAC
4. mac_mode="specific" with mac_address uses the provided MAC
5. preassoc_mac_mode="random" randomizes MAC during scanning
6. rand_addr_lifetime controls MAC rotation interval
7. MAC modes work across all four connection tools (PSK, EAP, TLS, HS20)
8. Invalid MAC format returns validation error

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |
| 6 | — | No test |
| 7 | — | No test |
| 8 | — | No test |

### Tags
`mac`, `privacy`, `cross-cutting`

---

## US-MAC-002: Permanent MAC Restoration in Docker

**Tools:** wifi_connect, wifi_connect_eap, wifi_connect_tls, wifi_hs20_connect | **Ref:** [mac-address-restoration](../design/mac-address-restoration.md)

As a user running in Docker, I want device mode to use my real hardware MAC so that MAC-based RADIUS authentication works without manual lookup.

### Acceptance Criteria

1. mac_mode="device" in Docker restores permanent MAC (not kernel-assigned)
2. Permanent MAC is read from `ip link show` permaddr at daemon startup
3. MAC restoration stops/restarts wpa_supplicant transparently
4. MAC restoration failure is non-fatal (connection still attempted)
5. No-op when current MAC already matches permanent MAC

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |

### Tags
`mac`, `docker`, `device-mode`, `cross-cutting`

---

## US-DOCK-001: Docker Network Namespace Isolation

**Ref:** [05_Docker_Netns_Isolation](../reference/05_Docker_Netns_Isolation.md) | [30_Docker_Dev_Plan](../plans/30_Docker_Dev_Plan.md)

As a user, I want WiFi to be fully isolated in the Docker container so that WiFi routes don't pollute the host routing table.

### Acceptance Criteria

1. WiFi phy is moved into container netns via `iw phy set netns`
2. WiFi interface disappears from host after phy move
3. Host routing table is unaffected during connect/disconnect
4. WiFi is the sole default route inside the container (bridge default deleted)
5. MCP client reaches container via Docker bridge subnet
6. Phy returns to host when container stops

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-BUILD-002 | Partial (Docker build only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | TC-INT-001 | Partial (health check only) |
| 6 | — | No test |

### Tags
`docker`, `netns`, `isolation`, `cross-cutting`

---

## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-MAC-001 | AC1-8 | — | No test |
| US-MAC-002 | AC1-5 | — | No test |
| US-DOCK-001 | AC1 | TC-BUILD-002 | Partial (Docker build) |
| US-DOCK-001 | AC2-4 | — | No test |
| US-DOCK-001 | AC5 | TC-INT-001 | Partial (health check) |
| US-DOCK-001 | AC6 | — | No test |

**Coverage:** 2/19 ACs have partial coverage. 0/19 have functional test coverage.
