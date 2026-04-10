# Credential User Stories

**Status:** Draft
**Created:** 2026-04-10
**Source:** [src/tools/credentials.ts](../../src/tools/credentials.ts) | [01_WiFi_Tools - Credential Tools](../reference/01_WiFi_Tools.md#credential-tools)

---

## US-CRED-001: Store EAP-TLS Credential

**Tool:** credential_store | **Ref:** [01_WiFi_Tools - credential_store](../reference/01_WiFi_Tools.md#credential_store)

As a user, I want to store EAP-TLS certificates so that I can reuse them for WiFi connections without re-uploading.

### Acceptance Criteria

1. Store with file paths (client cert + private key) creates credential
2. Auto-generates credential ID from certificate fingerprint when ID omitted
3. Custom ID with alphanumeric, dash, underscore is accepted
4. CA certificate is optional
5. Encrypted private key with password is accepted
6. Identity is extracted from certificate CN
7. Invalid certificate file returns informative error
8. Non-existent file path returns informative error
9. Credential files are stored with secure permissions (0600)

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-004 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |
| 6 | — | No test |
| 7 | — | No test |
| 8 | — | No test |
| 9 | — | No test |

### Tags
`credentials`, `store`, `eap-tls`, `certificate`

---

## US-CRED-002: Get Credential Details

**Tool:** credential_get | **Ref:** [01_WiFi_Tools - credential_get](../reference/01_WiFi_Tools.md#credential_get)

As a user, I want to retrieve credential details so that I can verify stored certificate metadata.

### Acceptance Criteria

1. Returns metadata: id, identity, description, timestamps, cert info
2. include_certs=true returns PEM certificate content
3. include_certs=false (default) omits PEM content
4. Non-existent credential ID returns informative error

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-004 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`credentials`, `get`, `metadata`

---

## US-CRED-003: List All Credentials

**Tool:** credential_list | **Ref:** [01_WiFi_Tools - credential_list](../reference/01_WiFi_Tools.md#credential_list)

As a user, I want to list all stored credentials so that I can see what certificates are available.

### Acceptance Criteria

1. Returns array of credentials with id, identity, description, dates
2. Returns count of stored credentials
3. Empty store returns empty array with count 0

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-004 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |

### Tags
`credentials`, `list`

---

## US-CRED-004: Delete a Credential

**Tool:** credential_delete | **Ref:** [01_WiFi_Tools - credential_delete](../reference/01_WiFi_Tools.md#credential_delete)

As a user, I want to delete a stored credential so that I can remove unused or expired certificates.

### Acceptance Criteria

1. Delete by ID removes all certificate files and metadata
2. Deleted credential no longer appears in credential_list
3. Non-existent credential ID returns informative error
4. Deletion is irreversible (documented behavior)

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-004 | Partial (registration only) |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`credentials`, `delete`

---

## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-CRED-001 | AC1 | TC-INT-004 | Partial (registration only) |
| US-CRED-001 | AC2-9 | — | No test |
| US-CRED-002 | AC1 | TC-INT-004 | Partial (registration only) |
| US-CRED-002 | AC2-4 | — | No test |
| US-CRED-003 | AC1 | TC-INT-004 | Partial (registration only) |
| US-CRED-003 | AC2-3 | — | No test |
| US-CRED-004 | AC1 | TC-INT-004 | Partial (registration only) |
| US-CRED-004 | AC2-4 | — | No test |

**Coverage:** 4/20 ACs have partial coverage (registration only). 0/20 have functional test coverage.
