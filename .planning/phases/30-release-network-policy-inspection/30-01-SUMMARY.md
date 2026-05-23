---
phase: 30-release-network-policy-inspection
plan: 01
summary_type: internal-planning
task_type: feature
completed: 2026-05-11
requirements_completed:
  - NETPOL-30-01
  - NETPOL-30-02
  - NETPOL-30-03
key_files:
  created:
    - packages/adapter-maestro/src/network-policy-inspection.ts
    - packages/adapter-maestro/test/network-policy-inspection.test.ts
    - packages/mcp-server/src/tools/inspect-network-policy.ts
  modified:
    - packages/contracts/src/types.ts
    - packages/contracts/src/constants/tool-names.ts
    - packages/contracts/src/index.ts
    - packages/adapter-maestro/src/index.ts
    - packages/adapter-maestro/src/capability-model.ts
    - packages/mcp-server/src/server.ts
    - packages/mcp-server/src/index.ts
    - packages/mcp-server/test/server.test.ts
    - packages/mcp-server/test/stdio-server.test.ts
    - README.md
    - README.zh-CN.md
    - docs/guides/ai-agent-invocation.zh-CN.md
repo_truth_synced:
  - README.md
  - README.zh-CN.md
  - docs/guides/ai-agent-invocation.zh-CN.md
  - packages/contracts/src/types.ts
  - packages/mcp-server/src/server.ts
verify_file: 30-01-VERIFY.md
---

# Phase 30 Plan 01 Summary

## Meta

- Task ID: 30-01
- Date: 2026-05-11
- Repo: mobile-e2e-mcp
- Owner: Codex
- Type: feature

## Goal

### Problem

Release builds can reject plain HTTP even when network connectivity is healthy; the harness had runtime network probing but no release policy inspection for Android cleartext or iOS ATS configuration.

### Expected Outcome

- [x] `inspect_network_policy` is exposed as a first-class read-only MCP capability.
- [x] Android and iOS policy checks return structured endpoint findings.
- [x] Missing/undecodable evidence returns `unknown`, not a false pass.
- [x] Public docs and capability reporting mention the new boundary.

### Non-goals

- No traffic proxying, packet capture, TLS diagnosis, backend health probing, or automatic config mutation.
- APK/IPA binary decoding remains conditional; decoded config files are the deterministic path.

## Plan

### Strategy

Implemented deterministic static inspection in the adapter, then wired it through contracts, server registry, stdio metadata, capability reporting, tests, and public docs.

### Task Breakdown

1. Added `InspectNetworkPolicy*` contracts and canonical tool name.
2. Added adapter policy parser/evaluator for Android Manifest/network security config and iOS Info.plist XML.
3. Added MCP server tool handler and registry descriptor.
4. Added adapter and server tests for policy behavior and tool surface.
5. Updated README and invocation guide.

### Risks / Unknowns

- Binary APK manifest decoding is not implemented; callers should pass decoded `AndroidManifest.xml` / `network_security_config.xml`.
- Binary Info.plist extraction from IPA is still conditional; decoded plist path is the reliable path.

### Done Criteria

- [x] Tool listed by server and stdio metadata.
- [x] Tool invocation returns structured `allowed` / `blocked` / `unknown` / `not_applicable` findings.
- [x] Adapter, server, stdio, typecheck, and build verification completed.

## Implement

### Changes

- `packages/adapter-maestro/src/network-policy-inspection.ts` — static policy parser/evaluator and tool result builder.
- `packages/contracts/src/types.ts` — input/output/finding/evidence types.
- `packages/contracts/src/constants/tool-names.ts` — `inspect_network_policy` canonical name.
- `packages/mcp-server/src/server.ts`, `packages/mcp-server/src/index.ts`, `packages/mcp-server/src/tools/inspect-network-policy.ts` — MCP contract and registry wiring.
- `packages/adapter-maestro/src/capability-model.ts` — Android/iOS read-only capability reporting.
- `README.md`, `README.zh-CN.md`, `docs/guides/ai-agent-invocation.zh-CN.md` — tool catalog and invocation docs.

### Key Decisions

- Deterministic config files and readable ZIP-based APK/IPA XML entries are supported; binary AXML/bplist artifact decoding remains explicitly conditional.
- HTTPS endpoints return `not_applicable`.
- Missing evidence returns `unknown`.
- The tool is read-only and does not require a session.

### Deviations

- `gitnexus_detect_changes()` was not available through the local GitNexus CLI; `npx gitnexus status` reported the index is stale and `git diff --stat` was used for scope review instead.

## Verify

### Test Cases

- [x] Android default blocks HTTP.
- [x] Android global cleartext allows HTTP.
- [x] Android domain config allows only matching domains.
- [x] iOS ATS default blocks HTTP.
- [x] iOS exception domain allows matching HTTP.
- [x] HTTPS is not applicable.
- [x] Missing evidence is unknown.
- [x] Server and stdio tool surfaces include `inspect_network_policy`.

### Evidence Types

- [x] test
- [x] command
- [x] readback

### Evidence

```bash
pnpm exec tsx --test packages/adapter-maestro/test/network-policy-inspection.test.ts
# pass: 7, fail: 0

pnpm --filter @shenyuexin/mobile-e2e-mcp build
# exit 0

pnpm typecheck
# exit 0

pnpm --filter @mobile-e2e-mcp/adapter-maestro test
# pass: 594, fail: 0

pnpm exec tsx --test packages/mcp-server/test/mcp-stdio-server.test.ts
# pass: 1, fail: 0
```

`pnpm --filter @shenyuexin/mobile-e2e-mcp test` was rerun outside the sandbox after a tsx IPC sandbox error. The full package run passed 266/267 tests and had one stdio subprocess timeout; the same failing `mcp-stdio-server.test.ts` passed when rerun directly.

### Result

- PASS with one existing full-suite stdio timeout caveat that passed in isolation.

## Retro

### What went well

- TDD caught the missing adapter module first and kept policy semantics crisp.
- Capability guardrails helped keep the tool read-only and evidence-oriented.

### What went wrong

- Node test-name filtering did not narrow some `tsx --test` runs, so several full files ran longer than intended.
- GitNexus CLI did not expose `detect_changes`, only status/impact.

### Reusable Rule

- If a new MCP tool imports workspace packages through package exports, rebuild the depended-on package before server tests because the tests resolve `dist` exports.

### Optimization Ideas

- Add a dedicated dev-cli flag for `inspect_network_policy` in a follow-up if CLI users need it outside MCP clients.
- Consider a future binary artifact decoder path using `aapt2` / `apkanalyzer` and `plutil` where local tooling exists.

## Source-of-Truth Sync

- Formal repo truth affected: yes.
- Updated: contracts, adapter implementation, MCP registry, tests, README docs, AI invocation guide.

## Next Step

- No immediate follow-up required for XML policy evidence; binary artifact decoding can be a future enhancement.
