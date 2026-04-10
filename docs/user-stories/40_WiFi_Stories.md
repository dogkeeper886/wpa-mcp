# WiFi User Stories

**Status:** Draft
**Created:** 2026-04-10
**Source:** [src/tools/wifi.ts](../../src/tools/wifi.ts) | [01_WiFi_Tools](../reference/01_WiFi_Tools.md)

---

## US-WIFI-001: Scan for Available Networks

**Tool:** wifi_scan | **Ref:** [01_WiFi_Tools - wifi_scan](../reference/01_WiFi_Tools.md#wifi_scan)

As a user, I want to scan for available WiFi networks so that I can see what networks are nearby and choose one to connect to.

### Acceptance Criteria

1. Scan returns a list of networks with SSID, BSSID, signal strength, and security flags
2. Hidden networks (empty SSID) appear in results with BSSID
3. Scan timeout is configurable (default 10s)
4. Retry mode handles wpa_supplicant INACTIVE state gracefully
5. Scan on non-existent interface returns informative error

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |

### Tags
`wifi`, `scan`, `discovery`

---

## US-WIFI-002: Connect to WPA-PSK Network

**Tool:** wifi_connect | **Ref:** [01_WiFi_Tools - wifi_connect](../reference/01_WiFi_Tools.md#wifi_connect)

As a user, I want to connect to a WPA-PSK WiFi network so that the device gets online with a secured connection.

### Acceptance Criteria

1. Connect with SSID + password reaches COMPLETED state
2. DHCP acquires an IP address after connection
3. Wrong password returns WRONG_KEY error with context
4. Connection timeout returns informative error (not hang)
5. BSSID targeting connects to a specific access point

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |

### Tags
`wifi`, `connect`, `psk`

---

## US-WIFI-003: Connect to Open / OWE Network

**Tool:** wifi_connect | **Ref:** [01_WiFi_Tools - wifi_connect](../reference/01_WiFi_Tools.md#wifi_connect)

As a user, I want to connect to an open or OWE (Enhanced Open) network so that I can access public WiFi or encrypted-open networks.

### Acceptance Criteria

1. Connect without password to open network reaches COMPLETED state
2. Connect with security_type='owe' uses OWE encryption without password
3. security_type='auto' defaults to open when no password provided
4. DHCP acquires IP address after open network connection

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`wifi`, `connect`, `open`, `owe`

---

## US-WIFI-004: Connect to WPA2-Enterprise (EAP) Network

**Tool:** wifi_connect_eap | **Ref:** [01_WiFi_Tools - wifi_connect_eap](../reference/01_WiFi_Tools.md#wifi_connect_eap)

As a user, I want to connect to a WPA2-Enterprise network using username and password so that I can access corporate WiFi.

### Acceptance Criteria

1. PEAP+MSCHAPV2 connection reaches COMPLETED state with IP
2. TTLS+PAP connection reaches COMPLETED state with IP
3. Wrong identity/password returns AUTH_FAILED with context
4. EAP method and phase2 are configurable
5. BSSID targeting works with EAP connections

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |

### Tags
`wifi`, `connect`, `eap`, `enterprise`

---

## US-WIFI-005: Connect with EAP-TLS Certificate

**Tool:** wifi_connect_tls | **Ref:** [01_WiFi_Tools - wifi_connect_tls](../reference/01_WiFi_Tools.md#wifi_connect_tls)

As a user, I want to connect to a WPA2-Enterprise network using EAP-TLS certificates so that I can authenticate without transmitting passwords.

### Acceptance Criteria

1. Connect via credential_id loads stored certs and reaches COMPLETED state
2. Connect via explicit file paths (identity + cert + key) reaches COMPLETED state
3. Encrypted private key with password works
4. Missing credential_id returns informative error
5. Missing required params (no credential_id and no file paths) returns validation error
6. CA certificate is optional (insecure mode for testing)

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |
| 6 | — | No test |

### Tags
`wifi`, `connect`, `eap-tls`, `certificate`

---

## US-WIFI-006: Connect via Hotspot 2.0 (Passpoint)

**Tool:** wifi_hs20_connect | **Ref:** [01_WiFi_Tools - wifi_hs20_connect](../reference/01_WiFi_Tools.md#wifi_hs20_connect)

As a user, I want to connect to a Hotspot 2.0 network so that the device auto-discovers and connects to compatible networks via ANQP.

### Acceptance Criteria

1. HS20 connection with valid credential_id + realm + domain reaches COMPLETED state
2. ANQP auto-discovers matching network (no SSID needed)
3. No matching HS20 network returns informative timeout error
4. Invalid credential_id returns error before connection attempt
5. Previous HS20 credentials are cleared before new connection
6. Failed connection cleans up HS20 credential from config

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |
| 6 | — | No test |

### Tags
`wifi`, `connect`, `hs20`, `passpoint`

---

## US-WIFI-007: Disconnect from Network

**Tool:** wifi_disconnect | **Ref:** [01_WiFi_Tools - wifi_disconnect](../reference/01_WiFi_Tools.md#wifi_disconnect)

As a user, I want to disconnect from the current WiFi network so that the device stops using that connection.

### Acceptance Criteria

1. Disconnect releases DHCP lease and flushes IP
2. wpa_state changes to DISCONNECTED after disconnect
3. HS20 credentials are cleared if active
4. Disconnect when already disconnected returns success (idempotent)

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`wifi`, `disconnect`

---

## US-WIFI-008: Check Connection Status

**Tool:** wifi_status | **Ref:** [01_WiFi_Tools - wifi_status](../reference/01_WiFi_Tools.md#wifi_status)

As a user, I want to check the current WiFi connection status so that I know if I'm connected, to which network, and with what IP.

### Acceptance Criteria

1. Returns wpa_state, SSID, BSSID, IP address when connected
2. Returns wpa_state=DISCONNECTED when not connected
3. EAP connections include eap_state, EAP_method, identity
4. Returns key_mgmt showing security type (WPA2-PSK, WPA-EAP, etc.)

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`wifi`, `status`

---

## US-WIFI-009: List Saved Networks

**Tool:** wifi_list_networks | **Ref:** [01_WiFi_Tools - wifi_list_networks](../reference/01_WiFi_Tools.md#wifi_list_networks)

As a user, I want to list saved WiFi networks so that I can see which networks are configured and their status.

### Acceptance Criteria

1. Returns list of saved networks with network_id, SSID, BSSID, flags
2. CURRENT flag indicates the connected network
3. TEMP-DISABLED flag indicates authentication failure
4. Empty list returned when no networks configured

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-003 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`wifi`, `networks`, `list`

---

## US-WIFI-010: Forget a Saved Network

**Tool:** wifi_forget | **Ref:** [01_WiFi_Tools - wifi_forget](../reference/01_WiFi_Tools.md#wifi_forget)

As a user, I want to remove a saved WiFi network so that I can clear wrong credentials or unused configurations.

### Acceptance Criteria

1. Remove network by network_id succeeds
2. Removed network no longer appears in wifi_list_networks
3. Invalid network_id returns informative error

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |

### Tags
`wifi`, `forget`, `networks`

---

## US-WIFI-011: Reconnect to Saved Network

**Tool:** wifi_reconnect | **Ref:** [01_WiFi_Tools - wifi_reconnect](../reference/01_WiFi_Tools.md#wifi_reconnect)

As a user, I want to reconnect to the current or most recent WiFi network without re-entering credentials.

### Acceptance Criteria

1. Reconnect uses saved configuration (no SSID/password needed)
2. Reaches COMPLETED state and acquires IP via DHCP
3. Reconnect when no saved network exists returns informative error

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |

### Tags
`wifi`, `reconnect`

---

## US-WIFI-012: Get EAP Diagnostics

**Tool:** wifi_eap_diagnostics | **Ref:** [01_WiFi_Tools - wifi_eap_diagnostics](../reference/01_WiFi_Tools.md#wifi_eap_diagnostics)

As a user, I want to get detailed EAP authentication diagnostics so that I can troubleshoot enterprise WiFi connection failures.

### Acceptance Criteria

1. Returns eap_state, selectedMethod, methodState, decision
2. eap_state=SUCCESS after successful EAP authentication
3. eap_state=IDLE with decision=FAIL indicates server rejected credentials
4. Works when no EAP connection is active (returns IDLE state)

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`wifi`, `diagnostics`, `eap`

---

## US-WIFI-013: Get Debug Logs

**Tool:** wifi_get_debug_logs | **Ref:** [01_WiFi_Tools - wifi_get_debug_logs](../reference/01_WiFi_Tools.md#wifi_get_debug_logs)

As a user, I want to get filtered wpa_supplicant debug logs so that I can troubleshoot connection issues.

### Acceptance Criteria

1. Filter "eap" returns only EAP/802.1X related log lines
2. Filter "state" returns connection state transitions
3. Filter "scan" returns network discovery logs
4. Filter "error" returns failures and timeouts
5. since_last_command=true returns only logs since last WiFi operation
6. Lines parameter limits output length

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |
| 6 | — | No test |

### Tags
`wifi`, `diagnostics`, `logs`

---

## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-WIFI-001 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-001 | AC2-5 | — | No test |
| US-WIFI-002 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-002 | AC2-5 | — | No test |
| US-WIFI-003 | AC1-4 | — | No test |
| US-WIFI-004 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-004 | AC2-5 | — | No test |
| US-WIFI-005 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-005 | AC2-6 | — | No test |
| US-WIFI-006 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-006 | AC2-6 | — | No test |
| US-WIFI-007 | AC1-4 | — | No test |
| US-WIFI-008 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-008 | AC2-4 | — | No test |
| US-WIFI-009 | AC1 | TC-INT-003 | Partial (registration only) |
| US-WIFI-009 | AC2-4 | — | No test |
| US-WIFI-010 | AC1-3 | — | No test |
| US-WIFI-011 | AC1-3 | — | No test |
| US-WIFI-012 | AC1-4 | — | No test |
| US-WIFI-013 | AC1-6 | — | No test |

**Coverage:** 8/56 ACs have partial coverage (registration only). 0/56 have functional test coverage.
