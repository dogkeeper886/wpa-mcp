---
name: user-stories
description: Generate user stories with acceptance criteria and test traceability
user-invocable: true
---

# Create User Stories

Generate user stories from source code, design docs, or feature descriptions — with acceptance criteria mapped to test cases.

```
$ARGUMENTS
```

## PURPOSE

Create user stories in `docs/user-stories/` that trace from actual code/design to acceptance criteria to test cases. This ensures functional coverage is maintained as new features are implemented.

Follows the chain: **PRD (docs/design/) -> User Stories (docs/user-stories/) -> Test Cases (cicd/tests/testcases/)**

---

## AGENT WORKFLOW

### Step 1: Identify Scope

Input can be:
- A tool domain — `wifi`, `connectivity`, `browser`, `credentials` (trace from source code)
- A design doc path — read and extract stories from the PRD
- A feature description — derive stories from requirements
- `all` — generate stories for the entire codebase

### Step 2: Trace the Source

For code-based stories:
1. Read the relevant tool file(s) in `src/tools/`
2. Read the corresponding reference doc(s) in `docs/reference/`
3. Read related design doc(s) in `docs/design/` if they exist
4. Identify every user-facing capability: each tool, each parameter mode, each error path

For PRD-based stories:
1. Read the design doc
2. Extract each distinct user capability from the User Flow and API sections

### Step 3: Review Existing Stories and Tests

- Read existing stories in `docs/user-stories/` to avoid duplication
- Read existing test cases in `cicd/tests/testcases/` to map coverage
- Find the next available story number

### Step 4: Generate User Stories

Create or update file(s) in `docs/user-stories/` using this format:

```markdown
# [Domain] User Stories

**Status:** Draft
**Created:** YYYY-MM-DD
**Source:** [link to tool file or design doc]

---

## US-[DOMAIN]-[NNN]: [Story Title]

**Tool:** [tool_name] | **Ref:** [link to reference doc section]

As a [user role], I want to [action] so that [benefit].

### Acceptance Criteria

1. [Testable criterion with expected outcome]
2. [Another criterion]
3. [Error case criterion]

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1   | TC-INT-xxx | Covered / TBD |
| 2   | TC-INT-xxx | Covered / TBD |

### Tags
`tag1`, `tag2`

---
```

**Story ID conventions:**
- `US-WIFI-xxx` — WiFi connection and management
- `US-CRED-xxx` — Credential management
- `US-NET-xxx` — Connectivity/network diagnostics
- `US-BROW-xxx` — Browser automation
- `US-MAC-xxx` — MAC address privacy (cross-cutting)
- `US-DOCK-xxx` — Docker isolation (cross-cutting)

**File naming:** `docs/user-stories/4x_[Domain]_Stories.md`
- `40_WiFi_Stories.md`
- `41_Connectivity_Stories.md`
- `42_Browser_Stories.md`
- `43_Credential_Stories.md`
- `44_Cross_Cutting_Stories.md` (MAC, Docker, etc.)

### Step 5: Generate Traceability Summary

At the bottom of each story file, add a traceability matrix:

```markdown
## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-WIFI-001 | AC1 | TC-INT-003 | Covered (registration) |
| US-WIFI-001 | AC2 | — | No test |
```

### Step 6: Update docs/README.md

Add any new story files to the Document Index under a "User Stories" section.

### Step 7: Report

Show the user:
- Files created/updated
- Story count per domain
- Coverage summary: how many ACs have tests vs TBD
- Suggest: `/ci-testcase` to create tests for uncovered ACs

---

## CONVENTIONS

- **Numbering:** User story docs use 40-49 range
- **One file per domain** — group related stories together
- **Acceptance criteria must be testable** — each AC should map to a verifiable outcome
- **Reference existing docs** — link to tool reference sections, don't duplicate parameter lists
- **Tags match test YAML tags** — so stories and tests are cross-searchable
- **Status field:** `Draft` until reviewed, `Complete` when all ACs have test coverage

---

## OUTPUT

Paths to created/updated story files and coverage summary.
