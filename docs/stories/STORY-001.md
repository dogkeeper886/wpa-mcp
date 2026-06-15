# STORY-001: README rewrite with diagrams

## User Story

As a developer discovering wpa-mcp,
I want a README that quickly shows me what the project is, why it's unusual, and how to run it — with diagrams for its hard-to-picture ideas,
So that I can understand and adopt it without first reading the whole `docs/` tree.

## The Need

The current README is a 379-line, Docker-heavy wall of prose with zero visuals. The
project's defining ideas — moving a WiFi PHY into a container's network namespace, a
dual-MCP single-port proxy, a token-efficient credential store — are spatial and
flow-based, exactly the kind of thing a picture explains in seconds and prose explains
poorly. A newcomer can't tell at a glance what makes this project distinctive or how to
get it running. The README should follow current best practices, lead with the point,
and carry a diagram for each key idea, while deep dives stay in `docs/`.

## Success Looks Like

- A newcomer reading only the README understands, within a minute: what wpa-mcp is, the
  problem it solves, and how to get it running.
- Each key project idea is illustrated by an embedded diagram that renders correctly on
  GitHub.
- The README follows a recognized best-practice structure (clear title, what/why,
  visual architecture, quickstart, configuration, tools, docs index) and is noticeably
  more scannable than the current one.
- Every command, endpoint, env var, and tool name the README mentions is accurate
  against the code.
- Deep reference material stays in `docs/`; the README links out rather than inlining it.

## Open Questions

- Which key ideas get their own diagram (the 3 signature ones, or more) — settled at the
  plan-review gate.
- Diagram authoring + embedding pipeline (SVG source → rendered raster → embed) and where
  the files live — worked out in the plan/issue.
- Whether a `make` target or script should make diagram rendering reproducible.

## Status

- Created: 2026-06-15
- Plan: #63
- Issues: #64, #65
- PR: #66
