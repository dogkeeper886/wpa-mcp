# Browser User Stories

**Status:** Draft
**Created:** 2026-04-10
**Source:** [src/tools/browser.ts](../../src/tools/browser.ts) | [03_Browser_Tools](../reference/03_Browser_Tools.md)

---

## US-BROW-001: Open URL in Browser

**Tool:** browser_open | **Ref:** [03_Browser_Tools - browser_open](../reference/03_Browser_Tools.md#browser_open)

As a user, I want to open a URL in the system browser so that I can manually interact with a captive portal or web page.

### Acceptance Criteria

1. Valid URL opens in the default system browser
2. Invalid URL returns informative error
3. Returns success message with the opened URL

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |

### Tags
`browser`, `open`

---

## US-BROW-002: Run Playwright Automation Script

**Tool:** browser_run_script | **Ref:** [03_Browser_Tools - browser_run_script](../reference/03_Browser_Tools.md#browser_run_script)

As a user, I want to run a Playwright script so that I can automate captive portal logins and browser interactions.

### Acceptance Criteria

1. Script executes and returns output on success
2. Variables are passed to the script and accessible
3. Headless mode is configurable (default: false)
4. Timeout is configurable (default: 60000ms)
5. Script not found returns informative error
6. Script timeout returns error with duration
7. Script failure returns error details

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |
| 5 | — | No test |
| 6 | — | No test |
| 7 | — | No test |

### Tags
`browser`, `script`, `playwright`, `captive-portal`

---

## US-BROW-003: List Available Scripts

**Tool:** browser_list_scripts | **Ref:** [03_Browser_Tools - browser_list_scripts](../reference/03_Browser_Tools.md#browser_list_scripts)

As a user, I want to list available Playwright scripts so that I know which automation scripts are ready to use.

### Acceptance Criteria

1. Returns list of script names in the scripts directory
2. Returns scripts directory path and count
3. Empty directory returns empty list with hint
4. Scripts directory is auto-created if missing

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | — | No test |
| 2 | — | No test |
| 3 | — | No test |
| 4 | — | No test |

### Tags
`browser`, `scripts`, `list`

---

## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-BROW-001 | AC1-3 | — | No test |
| US-BROW-002 | AC1-7 | — | No test |
| US-BROW-003 | AC1-4 | — | No test |

**Coverage:** 0/14 ACs have test coverage.
