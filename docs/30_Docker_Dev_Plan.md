# Docker Development Plan

**Status:** Draft  
**Updated:** 2026-02-06

---

## Context

The Docker netns isolation approach works (18/18 integration test pass). This plan
covers remaining work to make it production-ready and improve the developer experience.

### What works today

- Dockerfile builds wpa-mcp with all system deps
- `iw phy set netns` moves WiFi into container (tested with iwlwifi)
- Bridge default deleted so WiFi is sole internet path
- MCP client reaches container via Docker bridge subnet
- Host routing table unaffected throughout connect/disconnect
- Integration test covers full lifecycle

### What needs work

---

## Phase 1: Push current branch and merge

**Branch:** `feature/docker-netns-docs`

- [ ] Push branch to origin
- [ ] Create PR with 5 commits
- [ ] Review and merge to main

---

## Phase 2: Host preparation automation

The test revealed several host-side prerequisites that must be done before
the container can work. These should be automated or at least validated.

### 2.1 NetworkManager unmanage

Currently the test script runs `nmcli device set <iface> managed no` which
is temporary -- NM re-manages the device when it reappears after container
stops.

- [ ] Add persistent unmanage option: create `/etc/NetworkManager/conf.d/99-unmanaged-<iface>.conf`
- [ ] Add `make nm-unmanage WIFI_INTERFACE=wlp6s0` target
- [ ] Add `make nm-restore WIFI_INTERFACE=wlp6s0` to undo

### 2.2 Host wpa_supplicant conflict

Fedora runs wpa_supplicant in D-Bus mode (`-u -s`) for NetworkManager.
This doesn't interfere with the container's wpa_supplicant (different netns),
but should be documented. If someone runs wpa_supplicant with `-i <iface>` on
the host, the container's instance will conflict.

- [ ] Add preflight check in docker-run.sh: warn if host wpa_supplicant binds the same interface
- [ ] Document in troubleshooting

---

## Phase 3: Container routing improvements

### 3.1 dhclient default route

Currently dhclient only adds a WiFi default route if the bridge default is
deleted first. This is a manual step (`docker exec ... ip route del default`).

Options to automate:
- [ ] **Option A**: Entrypoint script that deletes bridge default on startup,
      then starts Node. Requires a custom entrypoint.
- [ ] **Option B**: Add a startup hook in `src/index.ts` that deletes the
      non-WiFi default route before first WiFi connect.
- [ ] **Option C**: Keep it in docker-run.sh (current approach). Simplest,
      but requires the helper script.

**Recommendation:** Option A (entrypoint script). It keeps the logic in the
container image and works regardless of how the container is started.

### 3.2 DNS inside the container

After WiFi connect, the container's DNS resolves via the Docker bridge
(`172.17.0.1` which forwards to the host). This works, but means DNS
doesn't go through the WiFi network. For true isolation:

- [ ] Configure DNS from DHCP response (dhclient already does this via
      `/etc/resolv.conf`, but Docker may override it)
- [ ] Test DNS resolution through WiFi gateway vs Docker bridge
- [ ] Decide if this matters for the use case

---

## Phase 4: Dockerfile improvements

### 4.1 Multi-stage build

Current Dockerfile installs all npm deps (including devDependencies), builds,
then prunes. A multi-stage build would be cleaner:

- [ ] Stage 1: `node:22` — install all deps, build TypeScript
- [ ] Stage 2: `node:22-slim` — copy dist/ and production node_modules only
- [ ] Reduces final image size

### 4.2 Entrypoint script

- [ ] Create `scripts/docker-entrypoint.sh`:
  1. Delete bridge default route (if WiFi interface present)
  2. Bring WiFi interface up (if present in netns)
  3. Exec `node dist/index.js`
- [ ] Update Dockerfile: `ENTRYPOINT ["./scripts/docker-entrypoint.sh"]`

### 4.3 Sudoers tightening

Current Dockerfile uses `NOPASSWD: ALL` for simplicity. Tighten to specific
commands:

- [ ] Enumerate exact paths inside Debian: `wpa_supplicant`, `wpa_cli`,
      `dhclient`, `ip`, `pkill`, `pgrep`, `mv`, `chmod`, `cat`, `kill`
- [ ] Verify paths with `which` inside the container
- [ ] Replace `ALL` with explicit list

### 4.4 Health check

- [ ] Add `HEALTHCHECK` instruction to Dockerfile:
      `HEALTHCHECK --interval=5s --timeout=3s CMD curl -sf http://localhost:3000/health`

---

## Phase 5: Integration test improvements

### 5.1 CI considerations

The current test requires real WiFi hardware and sudo. For CI:

- [ ] Add a `test-docker-build` target that only builds the image and verifies
      it starts (no WiFi needed)
- [ ] Add a `test-docker-netns-mock` that tests the netns move and route
      isolation without WiFi connect (uses a dummy interface or network namespace)

### 5.2 Test robustness

- [ ] Add timeout to wifi_connect MCP call (currently blocks until done)
- [ ] Add retry logic for scan (first scan after phy move may return empty)
- [ ] Test with open networks (no PSK)
- [ ] Test wifi_reconnect flow
- [ ] Test container restart (phy returns, re-move)

### 5.3 Parallel test support

- [ ] Use unique container name per test run (currently hardcoded `wpa-mcp-test`)
- [ ] Use random port (currently hardcoded 3199)

---

## Phase 6: Documentation

- [ ] Add Docker section to main README.md
- [ ] Add troubleshooting entries to `docs/20_Troubleshooting.md`:
  - `ip link set netns` immutable error → use `iw phy`
  - NM re-manages interface after container stop
  - dhclient doesn't add default route (bridge default exists)
  - wpa_cli permission denied (GROUP= in wpa_supplicant.conf)
- [ ] Update `docs/README.md` feature table with Docker support

---

## Phase 7: Future considerations

### 7.1 Podman support

Podman uses a different networking model (rootless, slirp4netns). Test and
document differences:

- [ ] Test `iw phy set netns` with Podman container PID
- [ ] Test port forwarding without root
- [ ] Document any differences

### 7.2 Docker Compose

- [ ] Create `docker-compose.yml` for easy deployment
- [ ] Include a sidecar init container that handles phy move
- [ ] Or a host-side systemd unit that moves phy after container starts

### 7.3 Multiple WiFi interfaces

- [ ] Test with multiple PCIe adapters (move multiple phys into one container
      or different containers)
- [ ] Support `WIFI_INTERFACE` as a comma-separated list

---

## Priority order

1. **Phase 1** — Merge current branch (ready now)
2. **Phase 4.2** — Entrypoint script (eliminates manual bridge default delete)
3. **Phase 4.3** — Tighten sudoers
4. **Phase 2.1** — Persistent NM unmanage
5. **Phase 5.1** — CI-friendly test
6. **Phase 6** — Documentation updates
7. Everything else as needed
