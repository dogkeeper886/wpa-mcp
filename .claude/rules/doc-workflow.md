---
paths:
  - ".claude/commands/doc-workflow/**/*.md"
---

# doc-workflow

A sibling to `dev-workflow` and `qa-workflow`. Where dev-workflow turns a need into shipped
code, doc-workflow turns a **codebase into its README** — a newcomer-facing document grounded
in current best practice, leading with the few ideas worth a diagram, and true to the code.

## The flow

```
   a repo  ──or──  "write the README for X"   (on request)
        │
        ▼
   doc-gen-readme ───► doc-review-readme ───► [human reviews] ───► PR
        │                    │
        │                    └─ reuses reviewing-phrasing + reviewing-typography,
        │                       then verifies every claim against the code
        ▼
   README.md (+ docs/images/* when diagrams help)
```

`doc-gen-readme` opens with a mandatory **WebSearch** step so the structure tracks current
convention rather than a frozen template. Diagrams are optional: when used, the SVG is the
source of truth and the embedded PNG is rendered reproducibly.

## Producer → review pairing

| Producer | Review | Covers |
|----------|--------|--------|
| `doc-gen-readme` | `doc-review-readme` | reads + looks right (via the reviewing skills), true to the code, delivers for a newcomer |

No producer ships without a review covering its output.

## What this owns — and what it reuses

- **Owns:** the README authoring flow + the accuracy gate (claims verified against the code,
  links resolve, diagrams match reality). Self-contained — markdown + the repo.
- **Reuses:** the human-read doc review — `reviewing-phrasing` (the words) and
  `reviewing-typography` (the look). `doc-review-readme` calls them rather than re-judging
  prose itself.
