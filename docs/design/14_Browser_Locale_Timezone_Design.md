# Browser Locale and Timezone Design

**Status:** Complete
**Created:** 2026-05-11
**Related:** [13_Dual_MCP_Playwright_Design.md](./13_Dual_MCP_Playwright_Design.md), [03_Browser_Tools.md](../reference/03_Browser_Tools.md), [GitHub Issue #47](https://github.com/dogkeeper886/wpa-mcp/issues/47)

---

> **Note:** This is a design document. For usage reference, see [03_Browser_Tools.md](../reference/03_Browser_Tools.md) once implemented.

---

## Goal

Allow a tester to configure the locale and timezone of the headless Chromium that the in-container `@playwright/mcp` subprocess launches, via two new environment variables — `WPA_MCP_BROWSER_LANG` and `WPA_MCP_BROWSER_TZ`. This unblocks i18n testing of captive portals: verifying that a portal popup (and any server-side artifact it triggers, e.g. OTP/notification emails) honors a visitor's browser locale, without hand-patching the container.

---

## Current State

The `@playwright/mcp` subprocess is launched by `docker/entrypoint.sh` with a fixed flag list (`--headless`, `--browser chromium`, `--no-sandbox`, `--allow-unrestricted-file-access`, `--output-dir`, `--port`, `--host`). The Chromium it spawns therefore reports its default locale and timezone:

- `navigator.language` defaults to the system locale (effectively `en-US` / `C`).
- `Accept-Language` is derived from that default.
- `Intl.DateTimeFormat().resolvedOptions().timeZone` reflects the host or `UTC`.

For an i18n verification flow — *"if a visitor's browser is `pt-PT`, does the portal popup AND the email it triggers come back in Portuguese?"* — the only ways to change locale today are:

1. Editing `docker/entrypoint.sh` locally and rebuilding the image, or
2. Killing the in-container `playwright-mcp` subprocess and relaunching it by hand with extra arguments.

Both are off the happy path for an MCP user driving the container from a Claude client.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Tester sets env vars before starting the container             │
│                                                                 │
│    # .env  (or `docker run -e ...`)                             │
│    WPA_MCP_BROWSER_LANG=pt-PT                                   │
│    WPA_MCP_BROWSER_TZ=Europe/Lisbon                             │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  sudo make docker-start                                         │
│                                                                 │
│  run.sh forwards both vars into the container                   │
│  entrypoint.sh sees at least one var set, generates             │
│    /tmp/playwright-mcp-config.json:                             │
│    { "browser": { "contextOptions": {                           │
│        "locale": "pt-PT",                                       │
│        "timezoneId": "Europe/Lisbon"                            │
│    } } }                                                        │
│  entrypoint.sh adds `--config /tmp/playwright-mcp-config.json`  │
│  to the playwright-mcp launch                                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Tester drives wpa-playwright as usual                          │
│                                                                 │
│  wifi_connect → join WLAN behind captive portal                 │
│  browser_navigate → first nav launches Chromium with the        │
│    configured contextOptions applied                            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Portal sees `Accept-Language: pt-PT` and serves Portuguese    │
│  page. navigator.language === "pt-PT" inside the browser.       │
│  Intl.DateTimeFormat times in Europe/Lisbon.                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Host                                                                 │
│                                                                       │
│  .env / `docker run -e ...` / systemd Environment=                    │
│    WPA_MCP_BROWSER_LANG=pt-PT                                         │
│    WPA_MCP_BROWSER_TZ=Europe/Lisbon                                   │
│                                                                       │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  docker run -e WPA_MCP_BROWSER_LANG \
                                 │            -e WPA_MCP_BROWSER_TZ
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Container (entrypoint.sh)                                            │
│                                                                       │
│   if [[ -n "$WPA_MCP_BROWSER_LANG" || -n "$WPA_MCP_BROWSER_TZ" ]];    │
│   then                                                                │
│     write /tmp/playwright-mcp-config.json with contextOptions         │
│     PW_CONFIG_FLAG="--config /tmp/playwright-mcp-config.json"         │
│   else                                                                │
│     PW_CONFIG_FLAG=""    ← no config file, unchanged behavior         │
│   fi                                                                  │
│                                                                       │
│   playwright-mcp \                                                    │
│     --headless --browser chromium --no-sandbox \                      │
│     --allow-unrestricted-file-access --output-dir ... \               │
│     --port 8931 --host 127.0.0.1 \                                    │
│     $PW_CONFIG_FLAG                                                   │
│                                                                       │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  @playwright/mcp subprocess                                           │
│                                                                       │
│  Reads /tmp/playwright-mcp-config.json once at startup.               │
│  Applies browser.contextOptions to every Chromium context it          │
│  creates (first browser_navigate spawns Chromium with the locale      │
│  and timezoneId baked in).                                            │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  Chrome DevTools Protocol
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Headless Chromium                                                    │
│                                                                       │
│  • navigator.language === locale                                      │
│  • navigator.languages === [locale]                                   │
│  • Accept-Language: locale on every request                           │
│  • Intl.DateTimeFormat().resolvedOptions().timeZone === timezoneId    │
│  • Number / date formatting follows locale rules                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## API

### Environment Variables

| Variable | Default | Type | Example | Effect |
|---|---|---|---|---|
| `WPA_MCP_BROWSER_LANG` | unset | BCP-47 locale string | `pt-PT`, `de-DE`, `en-GB`, `ja-JP` | Sets `browser.contextOptions.locale` in the generated config. Drives `navigator.language`, `Accept-Language`, and locale-aware `Intl` formatting. |
| `WPA_MCP_BROWSER_TZ` | unset | IANA timezone ID | `Europe/Lisbon`, `Asia/Tokyo`, `America/Los_Angeles` | Sets `browser.contextOptions.timezoneId`. Drives `Intl.DateTimeFormat().resolvedOptions().timeZone` and `Date()` wall-clock output. |

When **both** are unset, no config file is generated and no `--config` flag is added to the playwright-mcp launch — the container behaves exactly as before. When **either** is set, a single config file is generated covering whichever fields are present.

### Generated Config Shape

`@playwright/mcp@0.0.70` consumes `--config <path>` and reads a JSON file matching its [public `Config` shape](https://github.com/microsoft/playwright-mcp/blob/main/config.d.ts) (also shipped at `/usr/local/lib/node_modules/@playwright/mcp/config.d.ts` in the container). The minimal shape this feature emits:

```json
{
  "browser": {
    "contextOptions": {
      "locale": "pt-PT",
      "timezoneId": "Europe/Lisbon"
    }
  }
}
```

Either inner key is omitted when its env var is unset.

### Observable Effects

For `WPA_MCP_BROWSER_LANG=pt-PT` and `WPA_MCP_BROWSER_TZ=Europe/Lisbon` after `make docker-start`, with `browser_evaluate` against `about:blank`:

```js
navigator.language                                  // → "pt-PT"
navigator.languages                                 // → ["pt-PT"]
Intl.DateTimeFormat().resolvedOptions().timeZone    // → "Europe/Lisbon"
Intl.DateTimeFormat().resolvedOptions().locale      // → "pt-PT"
new Intl.NumberFormat().format(1234.5)              // → "1234,5"
new Date().toString()                               // → "... GMT+0100 (Hora de verão da Europa Ocidental)"
```

And every outbound request from the browser carries `Accept-Language: pt-PT`.

---

## Design Decisions

### 1. `--config <json>` over `--browser-arg=--lang=` (issue's original proposal)

**Choice:** Drive locale and timezone through a generated `--config` JSON, not Chromium browser-args.

**Rationale:** The issue proposed `--browser-arg=--lang=<value>`. That CLI flag does **not exist** in `@playwright/mcp@0.0.70` (verified via `playwright-mcp --help`). What the pinned version *does* expose is `--config <path>` accepting a `browser.contextOptions` object — and Playwright's `BrowserContextOptions.locale` documents that it sets `navigator.language`, the `Accept-Language` header, *and* `Intl` formatting rules in one stroke. `BrowserContextOptions.timezoneId` covers `Intl.DateTimeFormat().resolvedOptions().timeZone`. One mechanism, all three acceptance criteria, one upstream-supported config schema. (POC against the running container verified all three plus locale-aware number/date formatting on a real Amazon page.)

### 2. Generate the config file at entrypoint, don't ship a static template

**Choice:** Write the JSON inline in `docker/entrypoint.sh` only when at least one env var is set; remove the file otherwise.

**Rationale:** Conditional generation keeps the default path untouched — no `--config` flag is added when nobody asked for one, which preserves the exact pre-feature `playwright-mcp` invocation byte-for-byte. A shipped static template would always pass `--config` and rely on default fields, which couples the feature's existence to its activation. CLAUDE.md: *"Don't add features, refactor, or introduce abstractions beyond what the task requires"* — adding the `--config` arg only when needed honors that principle.

### 3. Keep the two env vars separate (vs. one combined config-blob var)

**Choice:** `WPA_MCP_BROWSER_LANG` and `WPA_MCP_BROWSER_TZ` are independent env vars; either can be set without the other.

**Rationale:** The container already configures itself via discrete env vars (`PORT`, `WIFI_INTERFACE`, `WPA_DEBUG_LEVEL`, `PLAYWRIGHT_MCP_PORT`, `WPA_MCP_VOLUME`). Two more fits that surface. A combined `WPA_MCP_BROWSER_CONFIG_JSON='{"...":"..."}'` would push raw JSON through shell quoting and `.env` parsing — a worse user experience for a 1-line config.

### 4. Pass-through plumbing in `docker/run.sh` and `deploy/wpa-mcp.service`

**Choice:** Add explicit `-e WPA_MCP_BROWSER_LANG` / `-e WPA_MCP_BROWSER_TZ` lines to `docker/run.sh`'s `docker run` block, and commented-out `Environment=` lines to the systemd unit.

**Rationale:** `docker run` only forwards env vars that are explicitly listed; the variables would be invisible to `entrypoint.sh` without this plumbing. The systemd unit follows the existing pattern of listing every supported var so an operator can uncomment a line without going to look up the name.

### 5. No runtime tool to change locale mid-session

**Choice:** No `wifi_set_locale` MCP tool. Locale is set at container start.

**Rationale:** Playwright's `contextOptions` are applied at **context creation** — i.e., at `playwright-mcp` launch, which is at `docker run` time for our setup. A live `wpa-playwright` session whose browser is already running cannot pick up a new locale without bouncing the subprocess. A runtime tool would either be a lie (no effect until restart) or would require a tear-down/relaunch flow that loses the active browser session. For a setup-time test config knob, env vars at `docker run` time are the right shape; document the limitation explicitly.

### 6. Defer shell-level system locale to a follow-up

**Choice:** This feature controls *browser* locale only. The container's shell `LANG`, `LC_ALL`, log timestamps, etc. are not changed.

**Rationale:** A full system locale would additionally require installing the `locales` apt package and running `locale-gen <locale>.UTF-8` in the Dockerfile — extra image size and build time for a use case nobody has asked for yet. Browser locale alone satisfies the i18n captive-portal test goal. Explicitly **out of scope:** container shell `LANG` / `LC_ALL`, `date` command output, log timestamps, anything outside the headless Chromium process. If a real use case for shell-level locale appears, add it then.

### 7. No Dockerfile changes for `TZ`

**Choice:** Rely on the existing `tzdata` package in the `node:22-slim` base image; no Dockerfile change needed. Container shell clock (`date`, log timestamps) is **not** changed — only the browser's view of timezone.

**Rationale:** The base image already ships the full IANA tzdata, so any `Europe/Lisbon`-style ID resolves. `BrowserContextOptions.timezoneId` is applied via CDP at context creation, so the override lives inside the headless Chromium process. The shell's clock is intentionally left alone to avoid surprising side effects on logs and process timestamps.

---

## Error Handling

| Scenario | Behavior | Resolution |
|---|---|---|
| Both env vars unset | No config file generated; no `--config` flag added; behavior is identical to today. | (Intentional — this is the default.) |
| `WPA_MCP_BROWSER_LANG` set, `WPA_MCP_BROWSER_TZ` unset | Config file generated with only `locale`; `timezoneId` omitted; `Intl.DateTimeFormat` resolves to host/UTC default. | (Intentional — partial config is valid.) |
| Invalid BCP-47 locale (e.g. `WPA_MCP_BROWSER_LANG=garbage`) | Playwright passes the string to Chromium; Chromium accepts most strings but may produce odd `Accept-Language` values. No crash. | Set a valid locale like `pt-PT`. The container surfaces no validation today — same posture as `WIFI_INTERFACE`. |
| Invalid IANA timezone (e.g. `WPA_MCP_BROWSER_TZ=Mars/Olympus_Mons`) | Playwright throws when creating a browser context; `browser_navigate` returns a context-creation error. | Set a valid IANA timezone like `Europe/Lisbon`. |
| Config file write fails (`/tmp` not writable) | `entrypoint.sh` exits non-zero before launching `playwright-mcp` thanks to `set -euo pipefail`. The container fails to start with a clear error in `docker logs`. | Container-level issue — `/tmp` is always writable inside a normal container. |
| Need to change locale at runtime | Not supported. | `make docker-restart` after updating the env var. Document this as a known limitation. |

---

## Files to Modify

| File | Change |
|---|---|
| `docker/entrypoint.sh` | Add a config-generation block before the `playwright-mcp` invocation; conditionally append `--config /tmp/playwright-mcp-config.json` to the flag list. |
| `docker/run.sh` | Add `-e WPA_MCP_BROWSER_LANG` and `-e WPA_MCP_BROWSER_TZ` to the `docker run` env-passthrough block (alongside `WIFI_INTERFACE`, `WPA_DEBUG_LEVEL`, `PORT`, `PLAYWRIGHT_MCP_PORT`). |
| `deploy/wpa-mcp.service` | Add two commented-out `Environment=` lines so an operator can uncomment to enable. |
| `.env.example` | Add two commented examples with realistic values (`pt-PT`, `Europe/Lisbon`). |
| `README.md` | Add both vars to the "Environment Variables" table with concrete example values and a one-line note about the "set at `docker run` time" limitation. |
| `docs/README.md` | Add this design doc (number 14) to the Document Index. |
| `docs/user-stories/42_Browser_Stories.md` | Append the new browser-locale story (added by `/user-stories`). |
| `cicd/tests/testcases/integration/` | Add a YAML test case asserting all three observable effects (added by `/ci-testcase`). |

No source-tree (`src/`) changes — the feature lives entirely in the container's launch wiring; the wpa-mcp Node server and its proxy are not involved.

---

## Related Documents

- [13_Dual_MCP_Playwright_Design.md](./13_Dual_MCP_Playwright_Design.md) — the dual-MCP architecture this feature plugs into; explains why playwright-mcp runs as a subprocess inside the container and is launched by `docker/entrypoint.sh`.
- [03_Browser_Tools.md](../reference/03_Browser_Tools.md) — browser-tool reference; the place to surface the new env vars to end users.
- [05_Docker_Netns_Isolation.md](../reference/05_Docker_Netns_Isolation.md) — context on why the browser must live in the container (captive-portal reachability), which is the whole reason i18n testing happens inside the container.
- [`@playwright/mcp` config schema](https://github.com/microsoft/playwright-mcp/blob/main/config.d.ts) — upstream definition of `browser.contextOptions`. Also shipped in the container at `/usr/local/lib/node_modules/@playwright/mcp/config.d.ts`.
- [GitHub Issue #47](https://github.com/dogkeeper886/wpa-mcp/issues/47) — original feature request; the mechanism described there (`--browser-arg=--lang=`) was superseded by the `--config <json>` approach during POC.
