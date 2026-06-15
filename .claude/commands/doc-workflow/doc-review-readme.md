# Review a Generated README

```
Check a README delivers for its reader, reads and looks right, and is true to the code.

Target: README.md (or the path written by /doc-gen-readme)

## PURPOSE

The paired review for `/doc-gen-readme`. A README is read by a person AND it makes claims
a person will run, so this gate has two halves: the human-read doc review (does it read and
look right) and an accuracy pass (is it true). It does not re-implement those checks — it
leans on the existing reviewing skills and verifies claims against the code.

Fits in the doc-workflow:

    doc-gen-readme → doc-review-readme → [human reviews] → PR

---

## WORKFLOW

    /doc-review-readme
        │
        ├─► Step 1: Reads + looks right (reuse the skills, don't duplicate them)
        │   - Run `reviewing-phrasing` — leads with the point, brief, right tone.
        │   - Run `reviewing-typography` — hierarchy, grouping, scannable at a glance.
        │   - These own the words and the look; this command does not re-judge them.
        │
        ├─► Step 2: True to the code (the accuracy half)
        │   - [ ] Every command, endpoint, env var, tool name, and path is verified
        │         against the code/build files — no invented flags. Grep the source.
        │   - [ ] Every link resolves to a file that exists (docs, images, configs).
        │   - [ ] Embedded images exist and render; diagrams match what the code does.
        │
        ├─► Step 3: Delivers for the reader
        │   - [ ] A newcomer gets what it is, why it's distinctive, and how to run it
        │         without first reading docs/.
        │   - [ ] Leads with the point; deep reference is linked, not inlined.
        │   - [ ] Follows a recognized best-practice structure.
        │
        └─► Step 4: Decision
            - PASS: reads + looks right, true, delivers → ready for a human + PR.
            - REVISE: name each finding with file:line + the smallest fix; apply the
              fixes (or hand the phrasing/typography ones back to those skills) and re-check.

---

## API Notes

- Reuses `reviewing-phrasing` + `reviewing-typography` (the human-read doc review) and
  adds the accuracy pass a README needs — it does not duplicate those skills.
- Read-mostly: reads the README + the code; on REVISE, edits the README in place.
- Review paired with the producer `/doc-gen-readme` (see .claude/rules/doc-workflow.md).
```
