# Browser User Stories

**Status:** Draft
**Created:** 2026-04-10
**Updated:** 2026-05-11
**Source:** [src/tools/browser.ts](../../src/tools/browser.ts) | [src/index.ts](../../src/index.ts) | [03_Browser_Tools](../reference/03_Browser_Tools.md) | [13_Dual_MCP_Playwright_Design](../design/13_Dual_MCP_Playwright_Design.md) | [14_Browser_Locale_Timezone_Design](../design/14_Browser_Locale_Timezone_Design.md)

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

## US-BROW-004: Step-by-Step Browser Control Inside the Container's Netns

**Endpoint:** `/playwright-mcp` | **Ref:** [03_Browser_Tools - Two Surfaces](../reference/03_Browser_Tools.md#two-complementary-browser-surfaces) | [13_Dual_MCP_Playwright_Design](../design/13_Dual_MCP_Playwright_Design.md)

As a user driving an unknown captive portal (e.g. WISPr, vendor-specific hotel portal), I want step-by-step browser primitives from a browser that shares the container's WLAN network namespace, so that I can authenticate through portals that are unreachable from the host.

### Acceptance Criteria

1. `wpa-playwright` MCP endpoint is reachable at `/playwright-mcp` on the same external port as `/mcp` (3000)
2. `initialize` on `/playwright-mcp` returns a `result.instructions` string so MCP clients surface "when to pick this server" guidance to the agent without user configuration
3. The intent string explicitly tells the agent to pick this server **after** `wifi_connect` for captive-portal / WLAN-only web tasks, and **not** for general host-internet browsing
4. Subsequent tool calls (`tools/list`, `tools/call`) round-trip the `Mcp-Session-Id` header returned by `initialize`
5. SSE notification channel (`GET /playwright-mcp`) streams without being buffered by the proxy
6. Browser launched by the proxied MCP reaches URLs on the WLAN joined via `wifi_connect` (captive portals, intranet-only hosts)
7. Browser cannot accidentally bypass the container netns (e.g., cannot reach host-only internet routes)
8. `@playwright/mcp` subprocess binds only to `127.0.0.1:8931`; no second external port is exposed
9. If the `@playwright/mcp` subprocess fails to bind at container startup, the entrypoint logs a clear error pointing at `/tmp/playwright-mcp.log`
10. Intent-injection works for both JSON (`application/json`) and SSE (`text/event-stream`) response bodies

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
| 8 | — | No test |
| 9 | — | No test |
| 10 | — | No test |

### Tags
`browser`, `playwright-mcp`, `captive-portal`, `wispr`, `netns`, `proxy`

---

## US-BROW-005: Configure Browser Locale and Timezone for i18n Captive-Portal Testing

**Env vars:** `WPA_MCP_BROWSER_LANG`, `WPA_MCP_BROWSER_TZ` | **Ref:** [14_Browser_Locale_Timezone_Design](../design/14_Browser_Locale_Timezone_Design.md) | **Issue:** [#47](https://github.com/dogkeeper886/wpa-mcp/issues/47)

As a user driving a captive portal through the proxied `wpa-playwright` MCP, I want to set the browser's locale and timezone at container start, so that I can verify the portal popup — and any server-generated artifacts it triggers (OTP / notification emails) — render in the visitor's expected language without hand-patching the container.

### Acceptance Criteria

1. With `WPA_MCP_BROWSER_LANG=pt-PT` set on `docker run`, `browser_evaluate` returning `navigator.language` resolves to `pt-PT` and `navigator.languages` is an array starting with `pt-PT`.
2. With `WPA_MCP_BROWSER_LANG=pt-PT`, every outbound HTTP request the browser makes carries an `Accept-Language` header beginning with `pt-PT` (exact `pt-PT` or weighted form `pt-PT,pt;q=…`).
3. With `WPA_MCP_BROWSER_TZ=Europe/Lisbon` set on `docker run`, `browser_evaluate` returning `Intl.DateTimeFormat().resolvedOptions().timeZone` resolves to `Europe/Lisbon`.
4. Either env var alone is a valid configuration — setting only `WPA_MCP_BROWSER_LANG` applies only `locale`; setting only `WPA_MCP_BROWSER_TZ` applies only `timezoneId`; the other field falls back to Chromium default.
5. When **both** env vars are unset, the `playwright-mcp` launch arguments are byte-identical to the pre-feature invocation: no config file is generated under `/tmp/`, and no `--config` flag is appended (regression guard).
6. README's "Environment Variables" table documents both `WPA_MCP_BROWSER_LANG` and `WPA_MCP_BROWSER_TZ` with concrete example values (e.g. `pt-PT`, `Europe/Lisbon`) and a one-line note that they are read at container start.
7. Setting `WPA_MCP_BROWSER_TZ` to an invalid IANA timezone string (e.g. `Mars/Olympus_Mons`) surfaces as a clear context-creation error on the first `browser_navigate` call rather than failing silently or producing UTC.

### Notes

- **Non-functional constraint — bind at container start.** Playwright's `contextOptions` are applied at Chromium context creation, which is the first `browser_navigate` after the `playwright-mcp` subprocess launches. Changing either env var mid-life has no effect until `make docker-restart` (or equivalent). This is documented as a known limitation, not a bug.
- **Browser scope only.** These env vars affect *only* the headless Chromium that `playwright-mcp` spawns. They do **not** change the container shell's `LANG` / `LC_ALL`, the output of `date`, or the timestamps in `/tmp/wpa_supplicant_*.log`. A full system locale is out of scope (would require the `locales` apt package + `locale-gen`).
- **Invalid locale strings are silently accepted.** Chromium does not validate `navigator.language` content; an unknown locale (e.g. `garbage`) is forwarded as-is to the `Accept-Language` header and `navigator.language`. Only invalid timezone IDs throw at context creation (covered by AC7).
- The implementation lives entirely in `docker/entrypoint.sh` plus passthrough plumbing in `docker/run.sh`, `deploy/wpa-mcp.service`, and `.env.example`. No `src/` changes.

### Test Mapping

| AC# | Test Case | Status |
|-----|-----------|--------|
| 1 | TC-INT-018 | Covered (specs written, pending implementation) |
| 2 | TC-INT-019 | Covered (specs written, pending implementation) |
| 3 | TC-INT-018 | Covered (specs written, pending implementation) |
| 4 | TC-INT-020 | Covered (specs written, pending implementation) |
| 5 | TC-INT-021 | Covered (specs written, pending implementation) |
| 6 | TC-INT-023 | Covered (specs written, pending implementation) |
| 7 | TC-INT-022 | Covered (specs written, pending implementation) |

### Tags

`browser`, `playwright-mcp`, `i18n`, `locale`, `timezone`, `captive-portal`, `config`

---

## Traceability Matrix

| Story | AC | Test Case | Status |
|-------|-----|-----------|--------|
| US-BROW-001 | AC1-3 | — | No test |
| US-BROW-002 | AC1-7 | — | No test |
| US-BROW-003 | AC1-4 | — | No test |
| US-BROW-004 | AC1-10 | — | No test |
| US-BROW-005 | AC1-7 | TC-INT-018, TC-INT-019, TC-INT-020, TC-INT-021, TC-INT-022, TC-INT-023 | Specs written, pending implementation |

**Coverage:** 7/31 ACs have test coverage (24 pre-existing stories still have no tests; all 7 ACs of US-BROW-005 covered by 6 new TC-INT specs that will run against the wpa-mcp:ci image once the feature is implemented).
