---
name: prd
description: Generate a Product Requirements Document in docs/design/
user-invocable: true
---

# Create PRD

Generate a Product Requirements Document (design doc) for a new feature or change.

```
$ARGUMENTS
```

## PURPOSE

Create a design document in `docs/design/` that captures the goal, user flow, architecture, API design, and key decisions for a feature — before implementation begins. Follows the pattern established by existing design docs (10_EAP-TLS_Design.md, 11_Credential_Store_Design.md, 12_HS20_Design.md).

---

## AGENT WORKFLOW

### Step 1: Understand the Feature

Input can be:
- A feature description or user request
- A GitHub issue number — read the issue for context
- A conversation — extract requirements from discussion

Identify:
- What problem this solves
- Who it's for (user persona)
- What tools/APIs are involved
- What already exists that this builds on

### Step 2: Review Existing Docs

Read existing design docs in `docs/design/` to:
- Find the next available number (current: 10, 11, 12 — next would be 13+)
- Follow the established format and style
- Check for overlap with existing features

Also read relevant reference docs in `docs/reference/` for current architecture context.

### Step 3: Generate the PRD

Create the design doc at `docs/design/<number>_<Feature_Name>_Design.md` using this structure:

```markdown
# Feature Name Design

**Status:** Draft
**Created:** YYYY-MM-DD
**Related:** [links to related docs]

---

> **Note:** This is a design document. For usage reference, see the corresponding reference doc once implemented.

---

## Goal

One paragraph: what are we building and why.

---

## Current State

What exists today. What gap or problem this addresses.

---

## User Flow

ASCII diagram showing the user's journey through this feature.

---

## Architecture

ASCII diagram showing components, data flow, and integration points.

---

## API

Parameters table, example request/response JSON for each new tool or endpoint.

---

## Design Decisions

For each non-obvious choice:
- **Choice:** What was decided
- **Rationale:** Why, referencing CLAUDE.md guidelines where applicable (readability, consistency, separation of concerns, error handling, observability)

---

## Error Handling

Table of errors, messages, and resolutions.

---

## Files to Modify

Table of files and what changes.

---

## Related Documents

Links to relevant existing docs.
```

### Step 4: Update docs/README.md

Add the new design doc to the Document Index under "Design Documents".

### Step 5: Report

Show the user:
- File path created
- Summary of what the PRD covers
- Suggest next steps: `/user-stories` to create stories, then `/ci-testcase` for tests

---

## CONVENTIONS

- **Numbering:** Design docs use 10-19 range (13, 14, 15...)
- **Naming:** `<number>_<Feature_Name>_Design.md` (PascalCase with underscores)
- **ASCII diagrams:** Use box-drawing characters consistent with existing docs
- **Status field:** Start as `Draft`, update to `Complete` after implementation
- **Decision records:** For smaller changes that don't need a full PRD, create an unnumbered file (like `mac-address-restoration.md`) in `docs/design/`

---

## OUTPUT

Path to the created design document.
