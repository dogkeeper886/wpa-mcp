# Generate a README

```
Research best practices, study the project, and write its README — diagrams and all.

Target: {{input}}  (a repo path, or empty for the current repo)

## PURPOSE

Turns a codebase into a README a newcomer gets in a minute. It grounds the structure in
a fresh web search (so it tracks current convention, not a frozen template), studies the
project for the few ideas worth leading with, optionally draws a diagram per idea, and
writes the file. The producer half of the doc-workflow; its output is gated by
`/doc-review-readme`. See `.claude/rules/doc-workflow.md`.

Fits in the doc-workflow:

    doc-gen-readme → doc-review-readme → [human reviews] → PR

This writes the README only. It does NOT open a PR.

---

## WORKFLOW

    /doc-gen-readme
        │
        ├─► Step 1: Research current best practices (WebSearch — do not skip)
        │   - Search for README best practices for THIS YEAR: section order, badges,
        │     where visuals go, what to cut. Note the sources.
        │   - This step keeps the generator current instead of freezing today's taste.
        │
        ├─► Step 2: Study the project for its key ideas
        │   - Read the existing README, docs/, architecture/design notes, the build
        │     files, and the source layout.
        │   - Name the few ideas that make the project distinctive — the ones a diagram
        │     explains better than prose. Rank them; recommend a focused set (≈3), not
        │     every idea. Deep dives stay in docs/ and get linked.
        │
        ├─► Step 3: Draft the structure
        │   - Adapt the researched structure to the project: title + one-liner + badges
        │     → what it is / problem → how it works (the key ideas) → features →
        │     quickstart → usage/config → reference → docs index → license.
        │   - Lead with the point; keep it scannable; link out rather than inline.
        │
        ├─► Step 4: Diagrams (optional — one per key idea)
        │   - If diagrams help, author one SVG per key idea (the editable source) and
        │     render each to PNG for reliable rendering; embed the PNG.
        │   - Make the render reproducible (a script / make target), not hand-exported.
        │   - Mirror any existing ASCII diagrams in docs/ so the picture matches reality.
        │
        ├─► Step 5: Write the README
        │   - If asked to rewrite, delete the old file and write fresh (don't patch prose).
        │   - VERIFY EVERY CLAIM against the code: commands, endpoints, env vars, tool
        │     names, file paths. A README is run by its reader — wrong is worse than terse.
        │   - Confirm every link resolves to a file that exists.
        │
        └─► Step 6: Hand off
            - Summarize what was written + the diagram set + the sources.
            - STOP. Gate it with /doc-review-readme before a PR. Do NOT open a PR here.

---

## EXAMPLE

    /doc-gen-readme

    1. WebSearch "README best practices <year> structure badges diagrams"
    2. Study repo → key ideas: <A>, <B>, <C>
    3. Draft structure; recommend 3 diagrams
    4. Author docs/images/<idea>.svg → render PNG (a reproducible render step)
    5. Write README.md; verify tool names / env vars / links against the code
    6. Hand off → /doc-review-readme

---

## API Notes

- Reads the repo + the web; writes README.md (+ docs/images/* if diagrams). No PR.
- The WebSearch step is mandatory — it is what keeps this command from going stale.
- Diagrams are optional; when used, SVG is the source of truth and the PNG is rendered.
- Producer paired with the review `/doc-review-readme` (see .claude/rules/doc-workflow.md).
- Right-size: a tiny project may need no diagrams; don't manufacture them.
```
