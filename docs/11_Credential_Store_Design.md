# Credential Store Design

**Status:** Complete  
**Created:** 2026-01-13  
**Updated:** 2026-01-14  
**Related:** [10_EAP-TLS_Design.md](./10_EAP-TLS_Design.md)

---

> **Note:** This is a design document. For usage reference, see [01_WiFi_Tools.md](./01_WiFi_Tools.md).

---

## Goal

Add CRUD tools for managing EAP-TLS certificates/credentials on the MCP server. This eliminates the need for AI agents to pass large PEM content in every connection request, reducing token usage and preventing data corruption.

---

## Problem Statement

### Original Problem: Passing PEM in Tool Calls

The original design required AI to pass PEM content directly in tool calls:

```
┌─────────────────────────────────────────────────────────────────┐
│  Original Flow (Problematic)                                    │
│                                                                 │
│  AI Agent                                                       │
│      │                                                          │
│      │  credential_store({                                      │
│      │    client_cert_pem: "-----BEGIN CERT..." (1.4KB)         │
│      │    private_key_pem: "-----BEGIN KEY..." (1.7KB)          │
│      │    ca_cert_pem: "-----BEGIN CERT..." (3.5KB)             │
│      │  })                                                      │
│      │                                                          │
│      │  ❌ AI corrupted base64 during generation                │
│      │  ❌ Slow (~1.5 min to format large strings)              │
│      │  ❌ High token usage                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Problems Discovered:**
- AI made typos in base64 encoding (e.g., `MDAwMMDow` instead of `MDAwMDAwW`)
- Large PEM strings are error-prone to generate
- Slow and expensive in tokens

---

## Solution: SCP + File Path Approach

Upload certificates via SCP first, then reference file paths in the credential store:

```
┌─────────────────────────────────────────────────────────────────┐
│  New Flow: SCP + File Path                                      │
│                                                                 │
│  Step 1: Upload via SCP (binary-safe)                           │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Local Machine                    Remote MCP Server             │
│  ┌─────────────┐                  ┌─────────────┐               │
│  │ client.crt  │ ───── SCP ─────► │ /tmp/certs/ │               │
│  │ client.key  │                  │  client.crt │               │
│  │ ca.crt      │                  │  client.key │               │
│  └─────────────┘                  │  ca.crt     │               │
│                                   └─────────────┘               │
│                                                                 │
│  Step 2: Store with file paths (fast, no corruption)            │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  AI Agent                                                       │
│      │                                                          │
│      │  credential_store({                                      │
│      │    id: "user01-tsengsyu",                                │
│      │    identity: "user01@tsengsyu.com",                      │
│      │    client_cert_path: "/tmp/certs/client.crt",            │
│      │    private_key_path: "/tmp/certs/client.key",            │
│      │    ca_cert_path: "/tmp/certs/ca.crt"                     │
│      │  })                                                      │
│      │                                                          │
│      │  ✓ No base64 in tool call                                │
│      │  ✓ Fast (~200 bytes vs 6KB)                              │
│      │  ✓ Binary integrity preserved                            │
│      │                                                          │
│      ▼                                                          │
│  MCP Server                                                     │
│      │                                                          │
│      │  1. Validate files exist                                 │
│      │  2. Validate PEM format (openssl verify)                 │
│      │  3. Copy to credential store                             │
│      │  4. Set permissions (0600)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Credential Lifecycle                        │
└─────────────────────────────────────────────────────────────────┘

  UPLOAD (Makefile)           STORE (MCP Tool)          USE
        │                           │                    │
        ▼                           ▼                    ▼
┌───────────────┐           ┌───────────────┐    ┌───────────────┐
│make upload-   │           │credential_    │    │wifi_connect_  │
│     certs     │           │    store      │    │     tls       │
│               │           │               │    │               │
│ Uploads to    │──────────►│ References    │───►│ Uses stored   │
│ /tmp/certs/   │           │ file paths    │    │ credential_id │
└───────────────┘           └───────────────┘    └───────────────┘

        LIST                        GET                 DELETE
          │                          │                     │
          ▼                          ▼                     ▼
  ┌───────────────┐          ┌───────────────┐    ┌───────────────┐
  │credential_list│          │credential_get │    │credential_    │
  │               │          │               │    │    delete     │
  │ Returns:      │          │ id: "my-cert" │    │               │
  │  [{id, ...}]  │          │               │    │ id: "my-cert" │
  └───────────────┘          │ Returns:      │    │               │
                             │  - identity   │    │ Removes all   │
                             │  - cert info  │    │ cert files    │
                             └───────────────┘    └───────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Local Development Machine                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Certificate Files              Makefile                        │
│  ┌─────────────┐               ┌─────────────┐                  │
│  │ client.crt  │───────────────│ upload-certs│                  │
│  │ client.key  │               │             │                  │
│  │ ca.crt      │               │ SCP to      │                  │
│  └─────────────┘               │ remote host │                  │
│                                └──────┬──────┘                  │
│                                       │                         │
└───────────────────────────────────────┼─────────────────────────┘
                                        │ SCP
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Remote MCP Server (WiFi Client)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /tmp/certs/                   MCP Server                       │
│  ┌─────────────┐               ┌─────────────────────────────┐  │
│  │ client.crt  │◄──────────────│ src/tools/credentials.ts    │  │
│  │ client.key  │               │                             │  │
│  │ ca.crt      │               │ credential_store reads from │  │
│  └─────────────┘               │ paths, validates, copies to │  │
│        │                       │ permanent store             │  │
│        │                       └──────────────┬──────────────┘  │
│        │                                      │                 │
│        │                                      ▼                 │
│        │                       ┌─────────────────────────────┐  │
│        │                       │ src/lib/credential-store.ts │  │
│        │                       │                             │  │
│        │                       │ CredentialStore class:      │  │
│        │                       │ ├── store(id, paths, meta)  │  │
│        │                       │ ├── get(id)                 │  │
│        │                       │ ├── list()                  │  │
│        │                       │ └── delete(id)              │  │
│        │                       └──────────────┬──────────────┘  │
│        │                                      │                 │
│        │                                      ▼                 │
│        │                       ┌─────────────────────────────┐  │
│        └──────────────────────►│ ~/.config/wpa-mcp/          │  │
│          validate & copy       │   credentials/{id}/         │  │
│                                │     client.crt              │  │
│                                │     client.key (0600)       │  │
│                                │     ca.crt                  │  │
│                                │     meta.json               │  │
│                                └─────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Makefile: upload-certs

### Usage

```bash
# Basic usage (all options on command line)
make upload-certs \
  CERT_REMOTE_HOST=jack@192.168.15.2 \
  CERT_CLIENT=./user01@tsengsyu.com_crt.pem \
  CERT_KEY=./user01@tsengsyu.com_prv.pem \
  CERT_CA=./tsengsyu.com_crt.pem

# Or configure in .env file
cat >> .env << 'EOF'
CERT_REMOTE_HOST=jack@192.168.15.2
CERT_CLIENT=./user01@tsengsyu.com_crt.pem
CERT_KEY=./user01@tsengsyu.com_prv.pem
CERT_CA=./tsengsyu.com_crt.pem
CERT_REMOTE_DIR=/tmp/certs
EOF

make upload-certs
```

### What It Does

1. Validates local certificate files exist
2. Creates remote directory with secure permissions (700)
3. Uploads files via SCP (binary-safe)
4. Sets file permissions (600) on remote
5. Prints paths for use with `credential_store`

### Output Example

```
Creating remote directory /tmp/certs...
Uploading certificates to jack@192.168.15.2:/tmp/certs/
Uploaded: client.crt, client.key, ca.crt

Certificates uploaded. Use credential_store with paths:
  client_cert_path: /tmp/certs/client.crt
  private_key_path: /tmp/certs/client.key
  ca_cert_path: /tmp/certs/ca.crt
```

---

## API: Credential Tools

### credential_store

Create or update a stored credential using file paths.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Unique identifier (alphanumeric, dash, underscore) |
| identity | string | Yes | Identity for EAP (CN from cert) |
| **client_cert_path** | string | Yes | Path to client cert on MCP server |
| **private_key_path** | string | Yes | Path to private key on MCP server |
| **ca_cert_path** | string | No | Path to CA cert on MCP server |
| private_key_password | string | No | Passphrase for encrypted key |
| description | string | No | Human-readable description |

**Note:** PEM string parameters (`client_cert_pem`, `private_key_pem`, `ca_cert_pem`) are **removed** to prevent corruption.

**Returns:**
```json
{
  "success": true,
  "id": "user01-tsengsyu",
  "created": true,
  "path": "/home/jack/.config/wpa-mcp/credentials/user01-tsengsyu"
}
```

**Validation performed:**
- File exists and is readable
- Valid PEM format (openssl x509/rsa verify)
- Certificate not expired (warning if < 30 days)

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
  "id": "user01-tsengsyu",
  "identity": "user01@tsengsyu.com",
  "description": "EAP-TLS cert for user01",
  "created_at": "2026-01-13T10:00:00Z",
  "has_ca_cert": true,
  "has_key_password": false,
  "cert_info": {
    "subject": "CN=user01@tsengsyu.com",
    "issuer": "CN=Root CA - tsengsyu.com",
    "not_after": "2026-04-13T00:00:00Z"
  }
}
```

### credential_list

List all stored credentials.

**Returns:**
```json
{
  "success": true,
  "credentials": [
    {
      "id": "user01-tsengsyu",
      "identity": "user01@tsengsyu.com",
      "description": "EAP-TLS cert for user01",
      "created_at": "2026-01-13T10:00:00Z",
      "has_ca_cert": true
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
  "id": "user01-tsengsyu",
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
| client_cert_path | string | No* | Path to cert (required if no credential_id) |
| private_key_path | string | No* | Path to key (required if no credential_id) |
| ca_cert_path | string | No | Path to CA cert |
| ... | | | (other params unchanged) |

*Either `credential_id` OR (`identity` + `client_cert_path` + `private_key_path`) required.

**Example with credential_id:**
```json
{
  "ssid": "8021x reference",
  "credential_id": "user01-tsengsyu"
}
```

---

## Complete Workflow Example

### Step 1: Upload Certificates

```bash
# On local machine
make upload-certs \
  CERT_REMOTE_HOST=jack@192.168.15.2 \
  CERT_CLIENT=./user01@tsengsyu.com_crt.pem \
  CERT_KEY=./user01@tsengsyu.com_prv.pem \
  CERT_CA=./letsencrypt-ca.pem
```

### Step 2: Store Credential (AI/MCP)

```
User: Store the uploaded certificates

AI: I'll store the credential using the uploaded file paths.

credential_store({
  "id": "user01-tsengsyu",
  "identity": "user01@tsengsyu.com",
  "client_cert_path": "/tmp/certs/client.crt",
  "private_key_path": "/tmp/certs/client.key",
  "ca_cert_path": "/tmp/certs/ca.crt",
  "description": "EAP-TLS cert for user01"
})

Result: Credential 'user01-tsengsyu' stored successfully.
```

### Step 3: Connect (AI/MCP)

```
User: Connect to 8021x reference

AI: Connecting using stored credential:

wifi_connect_tls({
  "ssid": "8021x reference",
  "credential_id": "user01-tsengsyu"
})

Result: Connected successfully!
```

---

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/credential-store.ts` | Change from PEM strings to file paths |
| `src/tools/credentials.ts` | Update parameters, add validation |
| `Makefile` | Add `upload-certs` target (DONE) |
| `.env.example` | Add cert path variables (DONE) |

### Validation Logic

```typescript
// In credential-store.ts
async function validateCertFile(path: string): Promise<void> {
  // Check file exists
  if (!fs.existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  // Validate PEM format using openssl
  const result = await exec(`openssl x509 -in "${path}" -noout -text`);
  if (result.exitCode !== 0) {
    throw new Error(`Invalid certificate: ${path}`);
  }
}

async function validateKeyFile(path: string): Promise<void> {
  const result = await exec(`openssl rsa -in "${path}" -check -noout`);
  if (result.exitCode !== 0) {
    throw new Error(`Invalid private key: ${path}`);
  }
}
```

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Temp files exposed | Upload to `/tmp/certs/` with 700/600 permissions |
| Private key in transit | SCP uses SSH encryption |
| Credential store access | Directory mode 0700, file mode 0600 |
| Temp file cleanup | User responsibility (or add cleanup command) |

---

## Error Handling

| Error | Message | Resolution |
|-------|---------|------------|
| File not found | `File not found: /tmp/certs/client.crt` | Run `make upload-certs` first |
| Invalid PEM | `Invalid certificate format` | Check file is valid PEM |
| Permission denied | `Cannot read file: permission denied` | Check file permissions |
| ID not found | `Credential 'xxx' not found` | Use `credential_list` to see available |

---

## Benefits of New Approach

| Aspect | Before (PEM in call) | After (File path) |
|--------|---------------------|-------------------|
| Data integrity | ❌ AI can corrupt base64 | ✓ Binary copy via SCP |
| Token usage | ❌ ~6KB per store call | ✓ ~200 bytes |
| Speed | ❌ Slow (AI generates) | ✓ Fast |
| Validation | ❌ After corruption | ✓ Before storing |
| Reusability | ❌ Re-generate each time | ✓ Upload once, use many |

---

## References

- [802.1x-credential-auth.md](./802.1x-credential-auth.md) - Original EAP-TLS design
- [XDG Base Directory Spec](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html) - Config directory location
