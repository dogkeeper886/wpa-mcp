## Dual-MCP Playwright Design

**Status:** Complete
**Created:** 2026-04-23
**Related:** [00_Architecture.md](../reference/00_Architecture.md), [03_Browser_Tools.md](../reference/03_Browser_Tools.md), [05_Docker_Netns_Isolation.md](../reference/05_Docker_Netns_Isolation.md)

---

> **Note:** This is a design document. For usage reference, see [03_Browser_Tools.md](../reference/03_Browser_Tools.md).

---

## Goal

Expose an MCP endpoint — `wpa-playwright` — that gives agents full step-by-step browser control (navigate, click, fill, snapshot, …) from a browser that runs **inside the wpa-mcp container's network namespace**. The browser shares the WLAN joined by `wifi_connect`, which is the only way to reliably drive captive portals, WISPr flows, and portal redirects end-to-end.

The existing `browser_run_script` scripted runner stays; this design **adds** a parallel step-by-step surface by embedding the official [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) server as a subprocess inside the container and reverse-proxying it on the single public port (3000).

---

## Problem Statement

### Why not the stock Playwright MCP?

Running `@playwright/mcp` on the host works for general browsing, but the browser it launches uses the host's routing table. After `wifi_connect` joins a WLAN inside the container, the captive portal only lives on that WLAN — it is invisible from the host. A host-side browser cannot reach it, so authenticating through a portal requires the browser to be inside the container's network namespace.

### Why not just more scripted tools?

`browser_run_script` is good for a known portal flow with pre-written scripts, but poor for exploratory or one-off portals (WISPr variants, unknown vendor portals). Agents need step-by-step primitives — click this element, fill that input, snapshot the DOM — not a full canned script. The Microsoft Playwright MCP already provides those exact primitives; re-implementing them inside `wpa-mcp` would be duplication.

### Why one port?

The container exposes exactly one TCP port (3000) to the host. Exposing a second port for the Playwright MCP would require another Docker port mapping and firewall allowance, and would make the MCP client configuration more brittle. A reverse proxy on a separate path keeps the external contract stable.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│          User joins WLAN behind captive portal                  │
│          wifi_connect → IP obtained, no internet                │
│          network_check_captive → redirect_url detected          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│   Agent picks wpa-playwright MCP (based on its `instructions`)  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│   browser_navigate(url)                                         │
│   browser_snapshot()                                            │
│   browser_click(ref)                                            │
│   browser_fill_form({ ... })                                    │
│   ... (iterate until portal accepts)                            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│   network_check_internet → captive portal cleared               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Public surface (one external port)

```
  ┌─────────────────────────────────────────────────────────┐
  │  HOST                                                    │
  │                                                          │
  │         MCP Client (Claude Code / Desktop)              │
  │                         │                                │
  │                         │   HTTP                         │
  │                         │   POST/GET/DELETE              │
  │                         ▼                                │
  │                  host:3000                               │
  └─────────────────────────┼────────────────────────────────┘
                            │  (Docker port forward,
                            │   only port exposed)
  ┌─────────────────────────┼────────────────────────────────┐
  │  CONTAINER (wpa-mcp)    ▼                                 │
  │                                                           │
  │                 express on :3000                          │
  │                   │                                       │
  │    ┌──────────────┼──────────────┐                        │
  │    ▼              ▼              ▼                        │
  │  /mcp       /playwright-mcp   /health                     │
  │  (in-proc)  (reverse proxy)                               │
  │                   │                                       │
  │                   │  http://localhost:8931/mcp            │
  │                   ▼                                       │
  │            @playwright/mcp subprocess                     │
  │            (loopback-only, not exposed)                   │
  │                   │                                       │
  │                   ▼                                       │
  │              headless Chromium                            │
  │                   │                                       │
  │                   │  uses container's netns               │
  │                   ▼                                       │
  │              wlan0 → joined WLAN                          │
  └───────────────────────────────────────────────────────────┘
```

### Endpoint mapping

| External path            | Transport                  | Served by                                       | Session model                   |
|--------------------------|-----------------------------|-------------------------------------------------|---------------------------------|
| `POST /mcp`              | Streamable HTTP (stateless) | `wpa-mcp` in-process                            | Stateless                       |
| `POST /playwright-mcp`   | Streamable HTTP (stateful)  | Reverse proxy → `@playwright/mcp` on `:8931`    | `Mcp-Session-Id` round-tripped  |
| `GET /playwright-mcp`    | SSE notification channel    | Reverse proxy (streamed)                        | Requires session id             |
| `DELETE /playwright-mcp` | Session close               | Reverse proxy (streamed)                        | Requires session id             |
| `GET /health`            | HTTP                        | `wpa-mcp` in-process                            | —                               |

`127.0.0.1:8931` is **internal implementation only** — never exposed externally and not part of the public contract. Its port is overridable via `PLAYWRIGHT_MCP_PORT` but there is no reason to change it.

---

## Design Decisions

### 1. Subprocess + reverse proxy (vs. embedding the MCP as a library)

**Choice:** run `@playwright/mcp` as a separate process launched by the container entrypoint; reverse-proxy it from the Node app.

**Rationale:**
- **Separation of concerns** — the Microsoft MCP has its own lifecycle, browser management, and transport. Wrapping it as a subprocess means `wpa-mcp` does not have to track upstream API changes.
- **Fault isolation** — a browser crash inside the Playwright MCP does not crash `wpa-mcp`; the Node server can keep serving `wifi_*` / `network_*` tools.
- **Consistency** — same deploy shape as upstream's own Docker example; easy to diff against their guidance.

Tradeoff: one extra process + a small amount of proxy code in `src/index.ts`.

### 2. Two proxy instances, dispatched by method (vs. one proxy)

The proxy layer has **two** `http-proxy-middleware` instances and dispatches per request:

| Instance                       | `selfHandleResponse` | Purpose                                                                     |
|--------------------------------|----------------------|-----------------------------------------------------------------------------|
| `playwrightInitializeProxy`    | `true`               | Buffers full response so `initialize` body can be rewritten with instructions |
| `playwrightStreamingProxy`     | `false`              | Streams everything else — tool-call results, SSE notifications, session delete |

Dispatch (`src/index.ts`):

```ts
const isInitialize =
  req.method === "POST" &&
  typeof req.body === "object" &&
  req.body !== null &&
  (req.body as { method?: unknown }).method === "initialize";
return isInitialize
  ? playwrightInitializeProxy(req, res, next)
  : playwrightStreamingProxy(req, res, next);
```

**Why two, not one:**
`selfHandleResponse: true` buffers the entire response body, which is required to rewrite the `initialize` response. But MCP uses long-lived SSE streams for tool progress and the `GET /mcp` notification channel, and buffering would deadlock those. Splitting by method keeps injection simple without breaking streaming.

### 3. `http://localhost:8931` (not `127.0.0.1:8931`) as the proxy target

`@playwright/mcp` enforces a same-origin `Host` header check. The proxy forwards the Host as whatever `changeOrigin: true` sets it to; binding the upstream at `127.0.0.1` but announcing `localhost` in the Host header fails that check. The simplest fix is to target `http://localhost:...` so the forwarded Host matches. Node's DNS resolver maps `localhost` → `127.0.0.1` with no network cost.

### 4. Intent discovery via the `initialize` response

MCP defines an optional `result.instructions` string on `initialize` responses. When present, clients like Claude Code surface it as server-level guidance to the LLM. The proxy sets this field on every initialize response so agents automatically see a "when to pick this server" description — without the user editing their MCP config or relying on the upstream default (which has none).

Implementation detail — the injection runs on two content types:

| Content type            | Strategy                                                                                    |
|-------------------------|---------------------------------------------------------------------------------------------|
| `application/json`      | `JSON.parse` the body; if `result.serverInfo` is present, set `result.instructions` and re-serialize. |
| `text/event-stream`     | Scan each `data: <json>` line with the `/^data: (.*)$/gm` regex; rewrite only the line whose JSON matches the initialize marker. |

The SSE path **requires** the `g` flag so the replacer callback sees every `data:` line — a single event stream can contain heartbeats and batched notifications interleaved with the initialize response.

Marker: `obj?.result?.serverInfo`. This is the only JSON-RPC response where that field is present, so it's a safe discriminator without tracking session state in the proxy.

### 5. Launch the binary directly, not via `npx`

The container entrypoint deletes the Docker bridge default route before the Node server starts, so the container has **no default route** until `wifi_connect` establishes one. `npx @playwright/mcp` performs a registry check at launch time and hangs on DNS. Using the installed binary (`playwright-mcp --port ... --host ...`) skips that check.

### 6. Pinned `@playwright/mcp@0.0.70`

Pre-release upstream; pin the exact version in the Dockerfile so image builds are reproducible. Bump intentionally as a separate commit after exercising the new version.

### 7. Pre-bake Chromium at build time

Runtime downloads are impossible for the same reason as (5) — no default route. The Dockerfile runs `playwright install-deps chromium` and `playwright install chromium` at build time, pinning the browser cache to `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` so both root (build-time install) and the `node` user (runtime) read from the same location. Adds ~170 MiB to the image; non-negotiable given the network constraint.

### 8. `--allow-unrestricted-file-access` and pinned `--output-dir`

Two constraints interact here:
- Claude Code sends the **client's** working directory as a file-access root on initialize (e.g. `/home/jack/something`). That path does not exist in the container.
- `@playwright/mcp` defaults to writing trace/screenshot artifacts under `<client.cwd>/.playwright-mcp`, so `mkdir -p` fails with `EACCES` as the `node` user.

Fix: launch with `--allow-unrestricted-file-access` (accept any root) and `--output-dir /tmp/playwright-mcp-output` (always writable). Both apply only inside the container and have no effect on the host.

### 9. No changes to the existing `/mcp` tool surface

`wpa-mcp`'s own tools are unchanged. The dual-MCP split is purely additive: the scripted runner (`browser_run_script`) still serves pre-written automation flows; the new surface serves exploratory/unknown portals.

---

## Intent String

The exact text injected into `initialize.result.instructions` (from `src/index.ts`):

```
Browser running inside the wpa-mcp container's network namespace.

Use this MCP for any web task AFTER wpa-mcp has joined a Wi-Fi network
via `wifi_connect` (or any of the WPA tools) — captive portals, portal
redirects, and web apps only reachable on that WLAN.

Do NOT use this MCP for general browsing on the host's main internet;
use the stock `playwright` MCP (if registered separately) for that.
```

This is the text a Claude Code client sees as server-level guidance when it registers the endpoint.

---

## Registration

```bash
# Host-reachable hostname/port, one port for both endpoints
claude mcp add wpa-mcp         --transport http http://<HOST>:3000/mcp
claude mcp add wpa-playwright  --transport http http://<HOST>:3000/playwright-mcp
```

For general-purpose browsing (host internet, not container WLAN), register the stock Microsoft Playwright MCP separately — it complements `wpa-playwright`, does not replace it.

---

## Operational Notes

| Aspect                    | Detail                                                                                   |
|---------------------------|------------------------------------------------------------------------------------------|
| Playwright MCP log        | `/tmp/playwright-mcp.log` inside the container                                           |
| Bind address              | `127.0.0.1:8931` (loopback only; not exposed via Docker)                                 |
| Startup sanity check      | Entrypoint waits up to 5 s for the socket to bind; logs a clear error if it doesn't     |
| Port override             | `PLAYWRIGHT_MCP_PORT` environment variable (both entrypoint and Node proxy read it)     |
| Artifact output dir       | `/tmp/playwright-mcp-output` (ephemeral, lost on container restart)                      |
| Chromium cache            | `/ms-playwright` (baked into image)                                                     |
| Browser sandbox           | Disabled (`--no-sandbox`); Chromium's setuid sandbox needs caps the container omits     |

---

## Files Touched

| File                          | Role                                                           |
|-------------------------------|----------------------------------------------------------------|
| `src/index.ts`                | Two reverse-proxy instances + dispatcher + intent injection    |
| `docker/entrypoint.sh`        | Launches `playwright-mcp` in the background + sanity check     |
| `docker/Dockerfile`           | Installs `@playwright/mcp@0.0.70`, pre-bakes Chromium + deps   |
| `package.json` / lockfile     | `http-proxy-middleware@^3.0.5`                                 |
| `CLAUDE.md` / `README.md`     | Documents the dual endpoint and registration                   |

---

## Non-Goals

- Shared browser session across `/mcp` and `/playwright-mcp`. They are independent transports; sharing state would pull the scripted runner's browser lifecycle into the subprocess, which conflicts with fault isolation.
- TLS termination at the proxy. The container's transport is plain HTTP on localhost/bridge; if TLS is needed, put it in front of Docker (reverse proxy on the host).
- Persistence of Playwright MCP session state across container restarts. Sessions are ephemeral by design; agents re-initialize.

---

## References

- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [http-proxy-middleware responseInterceptor](https://github.com/chimurai/http-proxy-middleware)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
- [00_Architecture.md](../reference/00_Architecture.md) — overall architecture
- [03_Browser_Tools.md](../reference/03_Browser_Tools.md) — browser tool reference
- [05_Docker_Netns_Isolation.md](../reference/05_Docker_Netns_Isolation.md) — why the browser must live in the container's netns
