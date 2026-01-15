# Hotspot 2.0 (HS20) Support Design

**Status:** Complete  
**Created:** 2026-01-14  
**Related:** [01_WiFi_Tools.md](./01_WiFi_Tools.md), [10_EAP-TLS_Design.md](./10_EAP-TLS_Design.md)

---

## Goal

Add Hotspot 2.0 (Passpoint) support to wpa-mcp, enabling automatic network discovery and seamless connection via ANQP queries. Uses existing credential_store for EAP-TLS certificates with additional realm/domain parameters.

---

## Background

### What is Hotspot 2.0?

Hotspot 2.0 (HS20), also known as Passpoint, is defined by IEEE 802.11u. It enables seamless WiFi roaming similar to cellular networks:

- **Automatic discovery** via ANQP (Access Network Query Protocol)
- **Credential-based matching** (realm/domain) instead of SSID selection
- **Seamless roaming** across multiple networks with same credentials

### Key Differences from Standard EAP-TLS

| Aspect | Standard EAP-TLS | HS20 EAP-TLS |
|--------|------------------|--------------|
| Network Selection | Manual (SSID required) | Automatic (realm/domain matching) |
| Configuration | `network={}` block | `cred={}` block |
| Discovery | None | ANQP queries |
| Scope | Single SSID | Multiple networks |

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    wifi_hs20_connect                            │
│                                                                 │
│  Input: credential_id, realm, domain                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│         Load certs from credential_store (existing)             │
│                                                                 │
│  ~/.config/wpa-mcp/credentials/<id>/                            │
│  ├── client.crt                                                 │
│  ├── client.key                                                 │
│  └── ca.crt                                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Add HS20 credential via wpa_cli                    │
│                                                                 │
│  wpa_cli add_cred → returns cred_id                             │
│  wpa_cli set_cred <id> realm "corp.example.com"                 │
│  wpa_cli set_cred <id> domain "example.com"                     │
│  wpa_cli set_cred <id> eap TLS                                  │
│  wpa_cli set_cred <id> client_cert "/path/to/client.crt"        │
│  wpa_cli set_cred <id> private_key "/path/to/client.key"        │
│  wpa_cli set_cred <id> ca_cert "/path/to/ca.crt"                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ANQP Network Discovery                             │
│                                                                 │
│  wpa_cli interworking_select auto                               │
│                                                                 │
│  wpa_supplicant:                                                │
│  1. Queries all visible APs via ANQP                            │
│  2. Retrieves NAI Realm List, Domain Name List                  │
│  3. Matches against credential's realm/domain                   │
│  4. Auto-selects best matching AP                               │
│  5. Initiates EAP-TLS authentication                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Wait for connection + DHCP                         │
│                                                                 │
│  waitForState('COMPLETED')                                      │
│  dhcpManager.start() → obtain IP address                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Return result                                      │
│                                                                 │
│  { success: true, ssid: "...", ip_address: "10.0.1.50" }        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      wifi_hs20_connect Tool                     │
│                      src/tools/wifi.ts                          │
├─────────────────────────────────────────────────────────────────┤
│  Input:                                                         │
│  • credential_id (references credential_store)                  │
│  • realm (required)                                             │
│  • domain (required)                                            │
│  • priority (optional, default: 1)                              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
            ┌───────────────────┴───────────────────┐
            │                                       │
            ▼                                       ▼
┌───────────────────────┐               ┌───────────────────────┐
│   credential_store    │               │       WpaCli          │
│   src/lib/credential- │               │   src/lib/wpa-cli.ts  │
│       store.ts        │               │                       │
├───────────────────────┤               ├───────────────────────┤
│ get(credential_id)    │               │ addCred()             │
│ • Returns cert paths  │               │ setCred()             │
│ • Returns identity    │               │ removeCred()          │
│ • Returns key password│               │ interworkingSelect()  │
└───────────────────────┘               │ connectHs20()         │
                                        └───────────────────────┘
                                                    │
                                                    ▼
                                        ┌───────────────────────┐
                                        │    wpa_supplicant     │
                                        │                       │
                                        │ • interworking=1      │
                                        │ • hs20=1              │
                                        │ • ANQP queries        │
                                        │ • Auto network select │
                                        └───────────────────────┘
```

---

## API: wifi_hs20_connect

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| credential_id | string | Yes | Reference to stored EAP-TLS credential |
| realm | string | Yes | Home realm for NAI matching (e.g., `corp.example.com`) |
| domain | string | Yes | Home domain for domain list matching (e.g., `example.com`) |
| priority | number | No | Selection priority when multiple networks match (default: 1) |
| interface | string | No | WiFi interface (default: wlan0) |

### Example Request

```json
{
  "credential_id": "my-corp-cert",
  "realm": "corp.example.com",
  "domain": "example.com"
}
```

### Example Response (Success)

```json
{
  "success": true,
  "message": "Connected via HS20",
  "credential_id": "my-corp-cert",
  "realm": "corp.example.com",
  "domain": "example.com",
  "status": {
    "wpaState": "COMPLETED",
    "ssid": "CorpWiFi-Passpoint",
    "bssid": "aa:bb:cc:dd:ee:ff",
    "ipAddress": "10.0.1.50",
    "keyManagement": "WPA2/IEEE 802.1X/EAP"
  }
}
```

### Example Response (No Network Found)

```json
{
  "success": false,
  "error": "No HS20 network found matching realm/domain",
  "realm": "corp.example.com",
  "domain": "example.com"
}
```

---

## Design Decisions

### 1. Implementation via wpa_cli (not config file)

**Choice:** Use `wpa_cli add_cred` / `set_cred` commands

**Rationale (per CLAUDE.md):**
- **Consistency** - Matches existing `connectTls` pattern using `add_network` / `set_network`
- **Clean rollback** - Can `remove_cred` on error (like `remove_network`)
- **Separation of concerns** - WpaCli class stays focused on wpa_cli commands
- **No file I/O** - Avoids config file parsing complexity

### 2. Reuse credential_store

**Choice:** Load certificates from existing credential_store

**Rationale:**
- **No duplication** - Same certs work for both `wifi_connect_tls` and `wifi_hs20_connect`
- **Consistency** - User manages certs in one place
- **Simpler UX** - Store once, use for multiple connection types

### 3. Basic HS20 parameters only

**Choice:** Support `realm` and `domain` only, no OI (Organization Identifier)

**Rationale:**
- **User requirement** - Single organization use case, no roaming partners
- **Simplicity** - OI adds complexity for advanced roaming scenarios

---

## Error Handling

Following CLAUDE.md guidelines - cleanup on failure with context-rich errors:

```typescript
async connectHs20(
  realm: string,
  domain: string,
  identity: string,
  clientCertPath: string,
  privateKeyPath: string,
  caCertPath?: string,
  privateKeyPassword?: string,
  priority?: number
): Promise<void> {
  const credId = await this.addCred();

  try {
    await this.setCred(credId, 'realm', realm);
    await this.setCred(credId, 'domain', domain);
    await this.setCred(credId, 'eap', 'TLS');
    await this.setCred(credId, 'client_cert', clientCertPath);
    await this.setCred(credId, 'private_key', privateKeyPath);
    // ... additional params

    await this.interworkingSelect(true);
  } catch (error) {
    // Cleanup on failure (same pattern as connectTls)
    await this.removeCred(credId).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`HS20 connection to ${realm} failed: ${message}`);
  }
}
```

---

## wpa_supplicant Requirements

HS20 requires wpa_supplicant with these build options:

```
CONFIG_INTERWORKING=y
CONFIG_HS20=y
```

And runtime configuration:

```conf
interworking=1
hs20=1
```

---

## Usage Example

### Step 1: Store EAP-TLS Credential

```json
{
  "tool": "credential_store",
  "params": {
    "id": "corp-cert",
    "identity": "user@corp.example.com",
    "client_cert_path": "/tmp/certs/client.crt",
    "private_key_path": "/tmp/certs/client.key",
    "ca_cert_path": "/tmp/certs/ca.crt"
  }
}
```

### Step 2: Connect via HS20

```json
{
  "tool": "wifi_hs20_connect",
  "params": {
    "credential_id": "corp-cert",
    "realm": "corp.example.com",
    "domain": "example.com"
  }
}
```

### Step 3: Verify Connection

```json
{
  "tool": "wifi_status"
}
```

---

## Debugging

Use `wifi_get_debug_logs` with filter `eap` to troubleshoot:

```json
{
  "tool": "wifi_get_debug_logs",
  "params": {
    "filter": "eap",
    "since_last_command": true
  }
}
```

Look for:
- `INTERWORKING-AP` events (discovered networks)
- `ANQP` messages (query/response)
- `EAP` state transitions

---

## Related Documents

- [01_WiFi_Tools.md](./01_WiFi_Tools.md) - WiFi tool reference
- [10_EAP-TLS_Design.md](./10_EAP-TLS_Design.md) - EAP-TLS design
- [11_Credential_Store_Design.md](./11_Credential_Store_Design.md) - Credential storage
