# WiFi Tools

**Status:** Complete  
**Updated:** 2026-01-14

---

## Goal

This document provides a complete reference for all WiFi-related MCP tools, including connection methods, network management, and diagnostics.

---

## Tools Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      WiFi Tools                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Connection                    Management                       │
│  ───────────                   ──────────                       │
│  wifi_connect                  wifi_scan                        │
│  wifi_connect_eap              wifi_status                      │
│  wifi_connect_tls              wifi_list_networks               │
│  wifi_disconnect               wifi_forget                      │
│  wifi_reconnect                                                 │
│                                                                 │
│  Diagnostics                   Credentials                      │
│  ───────────                   ───────────                      │
│  wifi_eap_diagnostics          credential_store                 │
│  wifi_get_debug_logs           credential_get                   │
│                                credential_list                  │
│                                credential_delete                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Connection Tools

### wifi_connect

Connect to WPA-PSK or open WiFi networks.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ssid | string | Yes | Network name |
| password | string | No | WPA passphrase (omit for open networks) |
| interface | string | No | WiFi interface (default: wlan0) |
| mac_mode | enum | No | MAC address mode |
| mac_address | string | No | Specific MAC (when mac_mode=specific) |
| preassoc_mac_mode | enum | No | Pre-association MAC mode |
| rand_addr_lifetime | number | No | MAC rotation interval in seconds |

**MAC Modes:**
- `device` - Use real hardware MAC
- `random` - New random MAC per connection
- `persistent-random` - Same random MAC across reboots
- `specific` - Use provided mac_address

**Pre-association MAC Modes:**
- `disabled` - Use current MAC for scanning
- `random` - Random MAC during scanning
- `persistent-random` - Persistent random during scanning

**Example:**
```json
{
  "ssid": "MyNetwork",
  "password": "secretpassword",
  "mac_mode": "random",
  "preassoc_mac_mode": "random"
}
```

**Response:**
```json
{
  "success": true,
  "ssid": "MyNetwork",
  "ip_address": "192.168.1.100",
  "bssid": "aa:bb:cc:dd:ee:ff",
  "frequency": 5180,
  "mac_address": "12:34:56:78:9a:bc"
}
```

---

### wifi_connect_eap

Connect to WPA2-Enterprise networks using PEAP or TTLS with password authentication.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ssid | string | Yes | Network name |
| identity | string | Yes | Username/identity |
| password | string | Yes | Password |
| eap_method | enum | No | EAP method: PEAP, TTLS (default: PEAP) |
| phase2 | string | No | Phase 2 auth: MSCHAPV2, PAP, etc. |
| anonymous_identity | string | No | Anonymous outer identity |
| ca_cert_path | string | No | CA certificate for server validation |
| interface | string | No | WiFi interface |
| mac_mode | enum | No | MAC address mode |
| mac_address | string | No | Specific MAC address |
| preassoc_mac_mode | enum | No | Pre-association MAC mode |
| rand_addr_lifetime | number | No | MAC rotation interval |

**Example:**
```json
{
  "ssid": "CorpWiFi",
  "identity": "user@company.com",
  "password": "userpassword",
  "eap_method": "PEAP",
  "phase2": "MSCHAPV2",
  "anonymous_identity": "anonymous@company.com"
}
```

**Response:**
```json
{
  "success": true,
  "ssid": "CorpWiFi",
  "ip_address": "10.0.1.50",
  "eap_method": "PEAP",
  "identity": "user@company.com"
}
```

---

### wifi_connect_tls

Connect using EAP-TLS certificate-based authentication (no password).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| ssid | string | Yes | Network name |
| credential_id | string | No* | Reference to stored credential |
| identity | string | No* | Identity (CN from client cert) |
| client_cert_path | string | No* | Path to client certificate |
| private_key_path | string | No* | Path to private key |
| ca_cert_path | string | No | Path to CA certificate |
| private_key_password | string | No | Passphrase for encrypted key |
| interface | string | No | WiFi interface |
| mac_mode | enum | No | MAC address mode |
| mac_address | string | No | Specific MAC address |
| preassoc_mac_mode | enum | No | Pre-association MAC mode |
| rand_addr_lifetime | number | No | MAC rotation interval |

*Either `credential_id` OR (`identity` + `client_cert_path` + `private_key_path`) required.

**Example with credential_id:**
```json
{
  "ssid": "SecureWiFi",
  "credential_id": "user01-corp"
}
```

**Example with paths:**
```json
{
  "ssid": "SecureWiFi",
  "identity": "device.company.com",
  "client_cert_path": "/tmp/certs/client.crt",
  "private_key_path": "/tmp/certs/client.key",
  "ca_cert_path": "/tmp/certs/ca.crt"
}
```

**Response:**
```json
{
  "success": true,
  "ssid": "SecureWiFi",
  "ip_address": "10.0.2.100",
  "eap_method": "TLS",
  "identity": "device.company.com"
}
```

---

### wifi_disconnect

Disconnect from current WiFi network and release DHCP lease.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "message": "Disconnected from network"
}
```

---

### wifi_reconnect

Reconnect to a previously saved network configuration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "ssid": "MyNetwork",
  "ip_address": "192.168.1.100"
}
```

---

## Network Management Tools

### wifi_scan

Scan for available WiFi networks.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "networks": [
    {
      "ssid": "HomeNetwork",
      "bssid": "aa:bb:cc:dd:ee:ff",
      "frequency": 2437,
      "signal": -45,
      "flags": "[WPA2-PSK-CCMP][ESS]"
    },
    {
      "ssid": "CorpWiFi",
      "bssid": "11:22:33:44:55:66",
      "frequency": 5180,
      "signal": -60,
      "flags": "[WPA2-EAP-CCMP][ESS]"
    }
  ],
  "count": 2
}
```

**Flag Meanings:**
- `[WPA2-PSK-CCMP]` - WPA2 Personal
- `[WPA2-EAP-CCMP]` - WPA2 Enterprise
- `[WPA-PSK-CCMP]` - WPA Personal
- `[ESS]` - Infrastructure mode
- `[WPS]` - WPS enabled

---

### wifi_status

Get current WiFi connection status.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{}
```

**Response (Connected):**
```json
{
  "success": true,
  "wpa_state": "COMPLETED",
  "ssid": "MyNetwork",
  "bssid": "aa:bb:cc:dd:ee:ff",
  "ip_address": "192.168.1.100",
  "frequency": 5180,
  "key_mgmt": "WPA2-PSK",
  "address": "12:34:56:78:9a:bc"
}
```

**Response (Disconnected):**
```json
{
  "success": true,
  "wpa_state": "DISCONNECTED",
  "address": "12:34:56:78:9a:bc"
}
```

**WPA States:**
- `DISCONNECTED` - Not connected
- `SCANNING` - Scanning for networks
- `AUTHENTICATING` - Authentication in progress
- `ASSOCIATING` - Association in progress
- `ASSOCIATED` - Associated, waiting for key exchange
- `4WAY_HANDSHAKE` - WPA key exchange
- `COMPLETED` - Fully connected

---

### wifi_list_networks

List all saved network configurations.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "networks": [
    {
      "network_id": 0,
      "ssid": "MyNetwork",
      "bssid": "any",
      "flags": "[CURRENT]"
    },
    {
      "network_id": 1,
      "ssid": "CorpWiFi",
      "bssid": "any",
      "flags": "[DISABLED]"
    }
  ],
  "count": 2
}
```

**Flag Meanings:**
- `[CURRENT]` - Currently connected
- `[DISABLED]` - Network disabled
- `[TEMP-DISABLED]` - Temporarily disabled (auth failure)

---

### wifi_forget

Remove a saved network configuration.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| network_id | number | Yes | Network ID from wifi_list_networks |
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{
  "network_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Network 1 removed"
}
```

---

## Diagnostic Tools

### wifi_eap_diagnostics

Get detailed EAP authentication state for debugging 802.1X issues.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| interface | string | No | WiFi interface (default: wlan0) |

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "eap_state": "SUCCESS",
  "selected_method": "PEAP",
  "method_state": "DONE",
  "decision": "COND_SUCC",
  "req_method": 25,
  "req_vendor": 0,
  "req_vendor_method": 0
}
```

**EAP States:**
- `DISABLED` - EAP not active
- `INITIALIZE` - Starting EAP
- `IDLE` - Waiting for request
- `RECEIVED` - Processing request
- `GET_METHOD` - Selecting EAP method
- `METHOD` - Running EAP method
- `SEND_RESPONSE` - Sending response
- `DISCARD` - Discarding packet
- `IDENTITY` - Sending identity
- `NOTIFICATION` - Notification received
- `RETRANSMIT` - Retransmitting
- `SUCCESS` - Authentication successful
- `FAILURE` - Authentication failed

---

### wifi_get_debug_logs

Get filtered wpa_supplicant debug logs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| filter | enum | No | Log filter type (default: all) |
| since_last_command | boolean | No | Only logs since last WiFi command |
| lines | number | No | Max lines to return (default: 100) |
| interface | string | No | WiFi interface (default: wlan0) |

**Filter Types:**
- `all` - All log entries
- `eap` - EAP/802.1X authentication
- `state` - Connection state transitions
- `scan` - Network discovery
- `error` - Failures and timeouts

**Example:**
```json
{
  "filter": "eap",
  "since_last_command": true,
  "lines": 50
}
```

**Response:**
```json
{
  "success": true,
  "logs": [
    "2026-01-14 10:00:01 EAP: EAP entering state IDENTITY",
    "2026-01-14 10:00:01 EAP: EAP entering state METHOD",
    "2026-01-14 10:00:02 EAP: Status notification: started (param=)",
    "2026-01-14 10:00:03 EAP: EAP entering state SUCCESS"
  ],
  "filter": "eap",
  "line_count": 4
}
```

---

## Credential Tools

### credential_store

Store EAP-TLS certificates for reuse.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Unique identifier (alphanumeric, dash, underscore) |
| identity | string | Yes | EAP identity (typically CN from cert) |
| client_cert_path | string | Yes | Path to client certificate on server |
| private_key_path | string | Yes | Path to private key on server |
| ca_cert_path | string | No | Path to CA certificate on server |
| private_key_password | string | No | Passphrase for encrypted key |
| description | string | No | Human-readable description |

**Example:**
```json
{
  "id": "user01-corp",
  "identity": "user01@company.com",
  "client_cert_path": "/tmp/certs/client.crt",
  "private_key_path": "/tmp/certs/client.key",
  "ca_cert_path": "/tmp/certs/ca.crt",
  "description": "User01 corporate certificate"
}
```

**Response:**
```json
{
  "success": true,
  "id": "user01-corp",
  "created": true,
  "path": "/home/user/.config/wpa-mcp/credentials/user01-corp"
}
```

---

### credential_get

Retrieve credential metadata.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Credential identifier |
| include_certs | boolean | No | Include PEM content (default: false) |

**Example:**
```json
{
  "id": "user01-corp"
}
```

**Response:**
```json
{
  "success": true,
  "id": "user01-corp",
  "identity": "user01@company.com",
  "description": "User01 corporate certificate",
  "created_at": "2026-01-14T10:00:00Z",
  "has_ca_cert": true,
  "has_key_password": false,
  "cert_info": {
    "subject": "CN=user01@company.com",
    "issuer": "CN=Corporate CA",
    "not_after": "2027-01-14T00:00:00Z"
  }
}
```

---

### credential_list

List all stored credentials.

**Parameters:** None

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "credentials": [
    {
      "id": "user01-corp",
      "identity": "user01@company.com",
      "description": "User01 corporate certificate",
      "created_at": "2026-01-14T10:00:00Z",
      "has_ca_cert": true
    }
  ],
  "count": 1
}
```

---

### credential_delete

Delete a stored credential.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | string | Yes | Credential identifier |

**Example:**
```json
{
  "id": "user01-corp"
}
```

**Response:**
```json
{
  "success": true,
  "id": "user01-corp",
  "deleted": true
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| WRONG_KEY | Incorrect password | Verify password |
| ASSOC_REJECT | Network rejected association | Check SSID, move closer |
| AUTH_FAILED | EAP authentication failed | Check identity/password |
| SCAN_FAILED | Interface not ready | Wait and retry |
| NO_DHCP | No IP from DHCP | Check network has DHCP |

### Error Response Format

```json
{
  "success": false,
  "error": "Connection failed: WRONG_KEY",
  "ssid": "MyNetwork"
}
```

---

## Related Documents

- [00_Architecture.md](./00_Architecture.md) - System architecture
- [10_EAP-TLS_Design.md](./10_EAP-TLS_Design.md) - EAP-TLS design
- [11_Credential_Store_Design.md](./11_Credential_Store_Design.md) - Credential storage design
