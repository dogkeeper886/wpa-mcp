# Changelog

All notable changes to wpa-mcp are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] — 2026-04-23

First tagged release. Major-version bump to mark the new dual-MCP public
contract: the container now exposes **two** MCP endpoints on a single
port (3000) — `/mcp` (wpa-mcp itself) and `/playwright-mcp` (reverse
proxy for Microsoft Playwright MCP running inside the container's
network namespace). See
[docs/design/13_Dual_MCP_Playwright_Design.md](docs/design/13_Dual_MCP_Playwright_Design.md).

### Added

- **Dual-MCP architecture**: `/playwright-mcp` reverse proxy in front of a
  containerised `@playwright/mcp@0.0.70` subprocess. The proxied browser
  shares the container's netns, so it reaches captive portals on the WLAN
  joined via `wifi_connect` — the only reliable path for WISPr / vendor
  portal testing. The proxy injects a `result.instructions` string into
  the `initialize` response so MCP clients surface "when to pick this
  server" guidance automatically. ([#41], [#43])
- **systemd daemon**: `sudo make install-systemd` installs a oneshot
  service that launches the container, moves the WiFi phy into the
  container's netns, and waits for health on boot. Uninstall with
  `sudo make uninstall-systemd`. ([#40], [#42])
- **Persistent credential store**: Docker named volume `wpa-mcp-data`
  mounted at `/home/node/.config/wpa-mcp` so credentials added at runtime
  via `credential_store` survive container restarts, image rebuilds, and
  host reboots. Baked certs under `certs/` are re-imported (idempotent)
  on every start. ([#40], [#42])
- **`wifi_hs20_connect`**: Hotspot 2.0 / Passpoint auto-discovery via
  ANQP queries; reuses `credential_store` for certificates. ([design](docs/design/12_HS20_Design.md))
- **Permanent-MAC restoration in Docker**: `mac_mode=device` now reads
  `permaddr` from `ip link show` at daemon start and restores the real
  hardware MAC before connecting, since `iw phy set netns` causes the
  kernel to assign a locally-administered MAC. ([#24], [design](docs/design/mac-address-restoration.md))
- **CI test framework**: YAML-driven test cases under `cicd/tests/` with
  `build` and `integration` suites, triggered via GitHub Actions
  `workflow_dispatch`. ([#34])
- **Functional integration tests**: 13 MCP tool tests exercised over a
  real Streamable HTTP transport. ([#39])
- **User stories + traceability**: `docs/user-stories/` with stories for
  all 22 MCP tools, plus cross-cutting (MAC, Docker netns) stories, each
  mapped to an acceptance-criteria → test-case matrix. ([#37])
- **`/prd` and `/user-stories` project skills** for the feature workflow
  (PRD → user stories → test cases) described in
  [CLAUDE.md](CLAUDE.md#feature-workflow-prd---user-stories---test-cases).
  ([#36])
- **Persistent NetworkManager unmanage**: `sudo make nm-unmanage` writes
  a drop-in under `/etc/NetworkManager/conf.d/` so the WiFi interface
  stays unmanaged across reboots. ([Docker Dev Plan §2.1](docs/plans/30_Docker_Dev_Plan.md#21-networkmanager-unmanage))
- **Container entrypoint**: deletes Docker bridge default route on start
  (keeping the bridge subnet route) so WiFi becomes the sole default
  once `wifi_connect` establishes a lease; includes preflight checks and
  a sanity timer for the Playwright MCP subprocess. ([#42], [#43])
- **Chromium pre-baked into the image**: `playwright install-deps
  chromium` + `playwright install chromium` at build time,
  `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` — required because the
  runtime container has no default route (so no on-demand download is
  possible).

### Changed

- **`wifi_scan` now paginates `bss <id>`** instead of parsing
  `scan_results`, avoiding truncation in dense RF environments
  (`scan_results` buffers at ~4 KiB). ([#44], [#45])
- **Documentation reorganised** into `docs/reference/`, `docs/design/`,
  `docs/operations/`, `docs/plans/`, `docs/user-stories/` with a new
  `docs/README.md` master index. ([#36])
- **README Reference section**: fixed link rot after the docs reorg (all
  links now point at the correct subfolder).
- **`docs/reference/00_Architecture.md`**: diagram and endpoint table
  updated to show the `/playwright-mcp` proxy and the in-container
  `@playwright/mcp` subprocess.

### Fixed

- `wifi_scan` truncation in dense RF environments (see above). ([#44])

### Internal

- **`http-proxy-middleware@^3.0.5`** added as a dependency for the
  `/playwright-mcp` reverse proxy.
- **`@playwright/mcp@0.0.70`** installed globally in the Docker image
  (pinned; bump deliberately).
- **TypeScript build** unchanged (`tsc`).

### Notes on public contract

- The only externally-exposed TCP port remains **3000**. The
  `127.0.0.1:8931` upstream for `@playwright/mcp` is an internal
  implementation detail and is not part of the public contract.
- `/mcp` tool surface is unchanged from 1.x — this is additive.
- `/playwright-mcp` is a **stateful** Streamable HTTP endpoint
  (`Mcp-Session-Id` round-trip required after `initialize`); `/mcp`
  remains **stateless**.

---

## [1.0.0] — 2025 (untagged baseline)

Initial feature set prior to the tagging scheme introduced in 2.0.0:

- WiFi tools: `wifi_scan`, `wifi_connect`, `wifi_connect_eap`,
  `wifi_connect_tls`, `wifi_disconnect`, `wifi_reconnect`, `wifi_status`,
  `wifi_list_networks`, `wifi_forget`, `wifi_eap_diagnostics`,
  `wifi_get_debug_logs`.
- Connectivity tools: `network_ping`, `network_check_internet`,
  `network_check_captive`, `network_dns_lookup`.
- Scripted browser tools: `browser_open`, `browser_run_script`,
  `browser_list_scripts`.
- Credential tools: `credential_store`, `credential_get`,
  `credential_list`, `credential_delete`.
- MAC randomization (`mac_mode`, preassoc, rand_addr_lifetime) across
  the four connection tools.
- Docker deployment via `iw phy set netns` for network-namespace
  isolation of WiFi.

---

[2.0.0]: https://github.com/dogkeeper886/wpa-mcp/releases/tag/v2.0.0
[1.0.0]: https://github.com/dogkeeper886/wpa-mcp/tree/34522b9

[#24]: https://github.com/dogkeeper886/wpa-mcp/pull/24
[#34]: https://github.com/dogkeeper886/wpa-mcp/pull/34
[#36]: https://github.com/dogkeeper886/wpa-mcp/pull/36
[#37]: https://github.com/dogkeeper886/wpa-mcp/pull/37
[#39]: https://github.com/dogkeeper886/wpa-mcp/pull/39
[#40]: https://github.com/dogkeeper886/wpa-mcp/issues/40
[#41]: https://github.com/dogkeeper886/wpa-mcp/issues/41
[#42]: https://github.com/dogkeeper886/wpa-mcp/pull/42
[#43]: https://github.com/dogkeeper886/wpa-mcp/pull/43
[#44]: https://github.com/dogkeeper886/wpa-mcp/issues/44
[#45]: https://github.com/dogkeeper886/wpa-mcp/pull/45
