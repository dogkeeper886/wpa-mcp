# Credential Store for EAP-TLS

**Status:** Proposed  
**Created:** 2026-01-13  
**Related:** [802.1x-credential-auth.md](./802.1x-credential-auth.md)

---

## Goal

Add CRUD tools for managing EAP-TLS certificates/credentials on the MCP server. This eliminates the need for AI agents to pass large PEM content in every connection request, reducing token usage and function call generation time.

---

## Problem Statement

Current `wifi_connect_tls` requires passing full PEM content for each connection:

```
┌─────────────────────────────────────────────────────────────────┐
│  Current Flow (Slow)                                            │
│                                                                 │
│  AI Agent ──────────────────────────────────────────────────────│
│      │                                                          │
│      │  1. Read cert files locally                              │
│      │  2. Generate large JSON with PEM content (~1.5 min)      │
│      │  3. Call wifi_connect_tls with full PEM                  │
│      │                                                          │
│      ▼                                                          │
│  MCP Server                                                     │
│      │                                                          │
│      │  4. Write temp files                                     │
│      │  5. Connect                                              │
│      │  6. Cleanup temp files                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Problems:**
- AI takes ~1.5 min to format/generate large PEM parameters
- Repeated for every connection attempt
- PEM content visible in conversation history
- No way to list/manage stored credentials remotely

---

## Solution: Credential Store

Store credentials on the MCP server with a simple ID reference:

```
┌─────────────────────────────────────────────────────────────────┐
│  New Flow (Fast)                                                │
│                                                                 │
│  AI Agent ──────────────────────────────────────────────────────│
│      │                                                          │
│      │  One-time setup:                                         │
│      │    credential_store (upload cert, key, ca)               │
│      │    Returns: credential_id = "corp-wifi-2026"             │
│      │                                                          │
│      │  Each connection (fast):                                 │
│      │    wifi_connect_tls(ssid, credential_id="corp-wifi-2026")│
│      │                                                          │
│      ▼                                                          │
│  MCP Server                                                     │
│      │                                                          │
│      │  1. Load certs from store by ID                          │
│      │  2. Connect using stored certs                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Credential Lifecycle                        │
└─────────────────────────────────────────────────────────────────┘

     CREATE                  READ                    DELETE
        │                      │                        │
        ▼                      ▼                        ▼
┌───────────────┐      ┌───────────────┐       ┌───────────────┐
│credential_store│      │credential_get │       │credential_    │
│               │      │               │       │  delete       │
│ id: "my-cert" │      │ id: "my-cert" │       │               │
│ client_cert   │      │               │       │ id: "my-cert" │
│ private_key   │      │ Returns:      │       │               │
│ ca_cert       │      │  - identity   │       │ Removes all   │
│ identity      │      │  - created_at │       │ cert files    │
└───────┬───────┘      │  - has_ca     │       └───────────────┘
        │              │  - cert info  │
        ▼              └───────────────┘
┌───────────────┐
│ Stored at:    │              LIST
│ ~/.config/    │                │
│  wpa-mcp/     │                ▼
│  credentials/ │      ┌───────────────┐
│  my-cert/     │      │credential_list│
│   client.crt  │      │               │
│   client.key  │      │ Returns:      │
│   ca.crt      │      │  [{id, ...}]  │
│   meta.json   │      └───────────────┘
└───────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Client                              │
│                  (Claude Desktop / Claude Code)                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │  credential_store / credential_get / etc.
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   src/tools/credentials.ts                      │
│                                                                 │
│  Tools:                                                         │
│  ├── credential_store    (create/update)                        │
│  ├── credential_get      (read metadata + optionally PEM)       │
│  ├── credential_list     (list all stored)                      │
│  └── credential_delete   (remove)                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                src/lib/credential-store.ts                      │
│                                                                 │
│  CredentialStore class:                                         │
│  ├── store(id, certs, metadata)                                 │
│  ├── get(id) → { paths, metadata }                              │
│  ├── list() → [{ id, metadata }]                                │
│  ├── delete(id)                                                 │
│  └── exists(id) → boolean                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    File System Storage                          │
│                                                                 │
│  ~/.config/wpa-mcp/credentials/                                 │
│  ├── corp-wifi/                                                 │
│  │   ├── client.crt                                             │
│  │   ├── client.key      (mode 0600)                            │
│  │   ├── ca.crt                                                 │
│  │   └── meta.json       { identity, created_at, ... }          │
│  └── guest-network/                                             │
│      └── ...                                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## API: Credential Tools

### credential_store

Create or update a stored credential.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Unique identifier (alphanumeric, dash, underscore) |
| identity | string | Yes | Identity for EAP (CN from cert) |
| client_cert_pem | string | Yes | PEM-encoded client certificate |
| private_key_pem | string | Yes | PEM-encoded private key |
| ca_cert_pem | string | No | PEM-encoded CA certificate |
| private_key_password | string | No | Stored encrypted passphrase |
| description | string | No | Human-readable description |

**Returns:**
```json
{
  "success": true,
  "id": "corp-wifi",
  "created": true,
  "path": "/home/user/.config/wpa-mcp/credentials/corp-wifi"
}
```

### credential_get

Read credential metadata and optionally certificate content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Credential identifier |
| include_certs | boolean | No | Include PEM content (default: false) |

**Returns:**
```json
{
  "success": true,
  "id": "corp-wifi",
  "identity": "device.example.com",
  "description": "Corporate WiFi cert",
  "created_at": "2026-01-13T10:00:00Z",
  "has_ca_cert": true,
  "has_key_password": false,
  "cert_info": {
    "subject": "CN=device.example.com",
    "issuer": "CN=Corporate CA",
    "not_after": "2027-01-13T00:00:00Z"
  }
}
```

### credential_list

List all stored credentials.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|

**Returns:**
```json
{
  "success": true,
  "credentials": [
    {
      "id": "corp-wifi",
      "identity": "device.example.com",
      "description": "Corporate WiFi",
      "created_at": "2026-01-13T10:00:00Z"
    }
  ],
  "count": 1
}
```

### credential_delete

Remove a stored credential.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Credential identifier |

**Returns:**
```json
{
  "success": true,
  "id": "corp-wifi",
  "deleted": true
}
```

---

## Updated wifi_connect_tls

Add optional `credential_id` parameter:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ssid | string | Yes | Network SSID |
| credential_id | string | No* | Reference to stored credential |
| identity | string | No* | Identity (required if no credential_id) |
| client_cert_pem | string | No* | PEM cert (required if no credential_id) |
| private_key_pem | string | No* | PEM key (required if no credential_id) |
| ca_cert_pem | string | No | PEM CA cert |
| ... | | | (other params unchanged) |

*Either `credential_id` OR (`identity` + `client_cert_pem` + `private_key_pem`) required.

**Example with credential_id:**
```json
{
  "ssid": "CorpWiFi",
  "credential_id": "corp-wifi"
}
```

---

## Implementation

### Files to Create

| File | Description |
|------|-------------|
| `src/lib/credential-store.ts` | CredentialStore class with CRUD operations |
| `src/tools/credentials.ts` | MCP tool definitions |

### Files to Modify

| File | Changes |
|------|---------|
| `src/index.ts` | Register credential tools |
| `src/tools/wifi.ts` | Add credential_id support to wifi_connect_tls |

---

## Storage Format

### Directory Structure

```
~/.config/wpa-mcp/credentials/
└── {credential_id}/
    ├── client.crt     # PEM certificate (mode 0600)
    ├── client.key     # PEM private key (mode 0600)
    ├── ca.crt         # PEM CA cert (optional, mode 0600)
    └── meta.json      # Metadata
```

### meta.json

```json
{
  "id": "corp-wifi",
  "identity": "device.example.com",
  "description": "Corporate WiFi certificate",
  "created_at": "2026-01-13T10:00:00Z",
  "updated_at": "2026-01-13T10:00:00Z",
  "has_ca_cert": true,
  "has_key_password": false
}
```

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Private key exposure | File mode 0600, directory mode 0700 |
| Credential enumeration | ID validation, no wildcards |
| Key password storage | Stored in meta.json (encrypted at rest by OS) |
| Unauthorized access | Follows OS user permissions |

---

## Error Handling

| Error | Message | Resolution |
|-------|---------|------------|
| ID not found | `Credential 'xxx' not found` | Use credential_list to see available |
| Invalid ID | `Invalid credential ID: must be alphanumeric, dash, underscore` | Fix ID format |
| Invalid PEM | `Invalid PEM format for client_cert` | Check certificate format |
| Permission denied | `Cannot write to credential store` | Check directory permissions |

---

## Usage Examples

### Store a New Credential

```
User: Store my corporate WiFi certificate

AI: I'll store the credential. First, let me read the certificate files.
    [reads local cert files]
    
    Now storing with credential_store:
    {
      "id": "corp-wifi",
      "identity": "device.example.com", 
      "client_cert_pem": "-----BEGIN CERTIFICATE-----...",
      "private_key_pem": "-----BEGIN PRIVATE KEY-----...",
      "ca_cert_pem": "-----BEGIN CERTIFICATE-----...",
      "description": "Corporate WiFi - expires 2027"
    }
    
    Credential stored successfully as 'corp-wifi'.
```

### Connect Using Stored Credential

```
User: Connect to CorpWiFi

AI: Connecting using stored credential:
    {
      "ssid": "CorpWiFi",
      "credential_id": "corp-wifi"
    }
    
    Connected successfully!
```

### List and Manage Credentials

```
User: What credentials do I have stored?

AI: [calls credential_list]
    
    You have 2 stored credentials:
    1. corp-wifi - device.example.com (expires 2027-01-13)
    2. guest-cert - guest.example.com (expires 2026-06-01)
```

---

## Testing

### Unit Tests

```bash
# Test credential store operations
npm test -- --grep "CredentialStore"
```

### Manual Testing

```bash
# Store credential
curl -X POST http://localhost:3000/mcp -d '{
  "method": "tools/call",
  "params": {
    "name": "credential_store",
    "arguments": {
      "id": "test-cert",
      "identity": "test@example.com",
      "client_cert_pem": "...",
      "private_key_pem": "..."
    }
  }
}'

# List credentials
curl -X POST http://localhost:3000/mcp -d '{
  "method": "tools/call",
  "params": {
    "name": "credential_list",
    "arguments": {}
  }
}'
```

---

## References

- [802.1x-credential-auth.md](./802.1x-credential-auth.md) - Original EAP-TLS design
- [XDG Base Directory Spec](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html) - Config directory location
