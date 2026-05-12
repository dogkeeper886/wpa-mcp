# Session Patterns

Last updated: 2026-05-12
Total sessions recorded: 1

## Workflow Distribution

| Pattern | Count | Last Seen |
|---------|-------|-----------|
| Design  | 1     | 2026-05-12 |
| Meta    | 1     | 2026-05-12 |

## Recurring Friction Points

| Friction Point | Occurrences | First Seen | Last Seen | Status |
|---------------|-------------|------------|-----------|--------|
| Agent over-theorizes on architectural hypotheses instead of grounding in code | 1 | 2026-05-12 | 2026-05-12 | Open |
| PRD "Files to Modify" misses sibling files that share a code pattern (e.g., parallel `docker run` blocks in two startup scripts) | 1 | 2026-05-12 | 2026-05-12 | Open |
| Test pattern regexes assume raw JSON when tool output is JSON-wrapped via `JSON.stringify(..., null, 2)` (escapes quotes) | 1 | 2026-05-12 | 2026-05-12 | Open |
| POC subprocess restarts produced confusing session-not-found errors attributed to architecture rather than restart | 1 | 2026-05-12 | 2026-05-12 | Open |
| Wireless phy didn't auto-return to host after container stop (Intel WiFi 6 / iwlwifi quirk) | 1 | 2026-05-12 | 2026-05-12 | Open |
| Cross-session reliability concern (browser failure across wifi state changes / roaming) not reproducible in controlled session | 1 | 2026-05-12 | 2026-05-12 | Open |

## Improvement Candidates

| Candidate | Evidence Count | Suggestion | Status |
|-----------|---------------|------------|--------|
| Self-review checklist before declaring an artifact done | 1 | Insert a one-page checklist (factual accuracy, link validity, sibling-file sweep, pattern correctness) into the `/prd`, `/user-stories`, and `/ci-testcase` skill outputs before the user is asked to review | Proposed |
| "Find siblings" pass in `/prd` Files to Modify | 1 | When the PRD lists a file with a noteworthy code pattern (e.g., `docker run`, shell exec, env var passthrough), grep the repo for the same pattern elsewhere and either include or explicitly exclude each match | Proposed |
| Pattern-match lint for `/ci-testcase` YAMLs | 1 | When generating regex `expectPatterns` against MCP tool outputs, agent should first capture one real example output and then derive the regex from observed structure (not assumed structure) | Proposed |
| CLAUDE.md note: ground hypotheses before analyzing | 1 | Add a sub-section under "Doing tasks": "When the user offers an architectural hypothesis, open the relevant files and confirm or refute against code before generating analysis. Avoid theorizing past one round-trip." | Proposed |
