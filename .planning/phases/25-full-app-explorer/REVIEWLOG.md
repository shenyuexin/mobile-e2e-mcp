# Review Log — Phase 25: Full App Explorer

Tracking document for all review findings and their resolutions. Prevents flip-flopping between conflicting review iterations.

---

## Review 1 — Deep Analysis (2026-04-13)

Reviewer: AI coding agent (systematic design review)

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| 1 | 🔴 Critical | Safety | No destructive operation protection (Delete Account, Reset Settings, Sign Out) | ✅ Fixed | Added `isDestructive()` filter in §4.4; added "destructive-action-policy" config in §3.1 |
| 2 | 🔴 Critical | Algorithm | Missing page-change validation after tap — can cause infinite loop on no-op elements | ✅ Fixed | Added `validateNavigation()` check in §4.1 core algorithm |
| 3 | 🔴 Critical | Budget | Backtrack cost not accounted for in `maxPages` adaptive budget | ✅ Fixed | Updated `maxPages` derivation formula in §4.7 to include backtrack rate |
| 4 | 🟡 Important | Reliability | Circuit breaker counts per-element failures, not per-page failures — can false-positive on pages with all non-navigable elements | ✅ Fixed | Changed `consecutiveFailures` → `consecutiveFailedPages` in §4.1 |
| 5 | 🟡 Important | Implementation | MCP adapter call path undecided (direct import vs HTTP) — causes implementation delay | ✅ Fixed | Added §4.8 with mandatory spike-confirmation requirement in 25-00 |
| 6 | 🟡 Important | Dedup | `pixelmatch` same-size screenshot requirement — normalization implementation not defined | ✅ Fixed | Added §4.3.1 Screenshot Normalization with `sharp` library justification |
| 7 | 🟢 Minor | Spike | Modal detection property names (`presentationStyle`) are assumptions from UIKit conventions | 📝 Noted | Added validation requirement in §4.5 spike verification note |
| 8 | 🟢 Minor | Heuristic | Infinite scroll "3 scrolls" is a magic number | 📝 Noted | Updated §4.7 infinite scroll detection to use content-change detection with 3 as minimum |

### Resolution Summary

- **3 critical fixes** applied to SPEC before implementation begins
- **3 important fixes** applied to SPEC before implementation begins
- **2 minor notes** documented for implementation awareness
- All fixes are **additive** — no existing behavior was removed or reversed
- Changed sections: §3.1 (config schema), §4.1 (core algorithm + circuit breaker + validation + system dialog), §4.3 (dedup note), §4.3.1 (new: screenshot normalization), §4.4 (element filtering + `isDestructive`), §4.7 (maxPages formula + infinite scroll), §4.8 (new: MCP adapter gate), §8 (risk assessment updated), §9.1 (acceptance criteria added), §9.3 (config dimensions 6→7)

---

## Review 2 — Strict Architecture Review (2026-04-13)

Reviewer: tech-design-reviewer skill (Staff Engineer / Architect perspective)

**Cross-check rule:** All findings below were verified against Review 1's table. Only truly new findings (not covered by R1 #1-#8) are listed.

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| R2-A | 🔴 Critical | Algorithm | DFS backtrack-once logic breaks sibling exploration — after tap A→push Child-A, for loop continues to tap B but device is now on Child-A's page, not parent P | ✅ Fixed | Rewrote §4.1 algorithm to per-element tap→explore→backtrack cycle (不再统一 for-loop 后单次 backtrack) |
| R2-B | 🟡 Important | Consistency | `findClickableElements` signature updated to require `config` in §4.4, but `captureSnapshot()` in §4.2 calls it without `config` — compile error | ✅ Fixed | Updated `captureSnapshot(config)` signature and all call sites in §4.1 |
| R2-C | 🟡 Important | Accuracy | `sharp` claimed "zero native dependencies on macOS" — false, `libvips` is a C native dependency | ✅ Fixed | Corrected to "prebuilt binaries on macOS x64/ARM64"; added pure-JS fallback note |
| R2-D | 🟢 Minor | Evidence | `pixelmatch` 0.05 threshold has no empirical basis — dynamic content (time, battery, weather) will cause false positives | ✅ Fixed | Added spike validation requirement in §4.3; marked threshold as "TBD — validate in 25-00" |
| R2-E | 🟢 Minor | Reliability | `isSystemDialog` 2+ keyword match can false-positive on legitimate pages (e.g., Notifications settings has "Allow" + "Not Now") | ✅ Fixed | Added `AccessibilityRole: 'alert'` structural check alongside keyword match in §4.1 |
| R2-F | 🟢 Minor | Budget | `avgBacktrackRate ≈ 0.8` is an assumption — real app navigation trees are highly skewed | ✅ Fixed | Changed to dynamically measured in 25-00 spike; initial estimate noted as "calibrate with data" |

### Cross-Reference with Review 1

| Review 2 Finding | Overlaps with Review 1 #? | Why it's a new finding |
|-----------------|---------------------------|----------------------|
| R2-A (DFS backtrack bug) | None | R1 #2 added `validateNavigation` (no-op prevention), but didn't touch the core DFS loop structure. R2-A is about sibling exploration failing. |
| R2-B (signature mismatch) | None | R1 #4 changed circuit breaker counter, R1 #1 added `isDestructive` with config param — but neither noticed the `captureSnapshot` call site gap. |
| R2-C (sharp native deps) | Partially R1-#6 | R1-#6 added §4.3.1 screenshot normalization with sharp. R2-C corrects a factual inaccuracy in the dependency claim — a separate concern. |
| R2-D (pixelmatch threshold) | Partially R1-#6 | R1-#6 defined the normalization pipeline. R2-D questions the 0.05 threshold value itself — not the normalization mechanics. |
| R2-E (isSystemDialog false positive) | None | R1 added `isSystemDialog` + `handleSystemDialog` in §4.1. R2-E questions the detection logic's false-positive rate. |
| R2-F (backtrack rate 80%) | Partially R1-#3 | R1-#3 added backtrack cost to maxPages formula. R2-F questions the 0.8 magic number in that formula. |

### Resolution Summary

- **1 critical fix** (DFS algorithm restructure) — must be fixed before any implementation
- **2 important fixes** (signature consistency, dependency accuracy) — fix before implementation
- **3 minor notes** (threshold evidence, false-positive rate, magic number) — validate during 25-00 spike
- All fixes are **additive or corrective** — no existing behavior was removed
- Changed sections: §4.1 (algorithm restructure + isSystemDialog improvement), §4.2 (captureSnapshot signature), §4.3 (threshold marked TBD), §4.3.1 (sharp claim corrected), §4.7 (backtrack rate marked calibrate), §8 (risk table updated), §9.1 (backtrack criterion quantified)

---

## Review 3 — SPEC vs Sub-PLAN Alignment (2026-04-13)

Reviewer: AI coding agent (cross-document consistency review)

**Scope:** 25-SPEC.md (v3.0, post-R1+R2) vs 5 sub-PLANs (25-00 through 25-05).

**Cross-check rule:** All findings verified against the current SPEC text and the actual PLAN text. Only genuinely new gaps are listed.

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| R3-A | 🔴 Critical | Algorithm | **25-01 Step 4 `Frame` type is stale** — SPEC §4.1 rewrote Frame to include `elementIndex: number` + `elements: ClickableTarget[]`, but 25-01 Step 4 only has `{ state, depth, path }` (the old broken version) | ⬜ Pending | Must update 25-01 Step 4 to match SPEC's corrected Frame |
| R3-B | 🔴 Critical | Algorithm | **25-01 Step 4 uses `for` loop with `pop()`** — the old broken DFS pattern that R2-A fixed. SPEC now uses `peek + elementIndex cursor + per-element immediate exploration`. 25-01's implementation steps still follow the old for-loop pattern | ⬜ Pending | Must rewrite 25-01 Step 4's algorithm to match SPEC |
| R3-C | 🟡 Important | Types | **25-01 Step 2 `ExplorerConfig` missing `destructiveActionPolicy`** — SPEC §3.1 added this field, but 25-01's types.ts doesn't include it | ⬜ Pending | Add to 25-01 Step 2 types.ts |
| R3-D | 🟡 Important | Types | **25-01 Step 2 `Frame` missing `elementIndex` + `elements`** — same as R3-A but at the type level. The type definition in Step 2 is also stale | ⬜ Pending | Update Frame type in 25-01 Step 2 |
| R3-E | 🟡 Important | Dependencies | **25-01 Step 1.2 adds `@noble/hashes`** — SPEC §4.2 uses built-in `crypto.subtle` or Node `crypto.createHash('sha256')` for screenId hash. `@noble/hashes` is an unnecessary new dependency | ⬜ Pending | Replace with Node built-in `crypto` module |
| R3-F | 🟡 Important | Scope | **25-01 bundles `report.ts` but 25-02 is a separate plan** — 25-01 Step 1.5 lists `src/report.ts` in the engine package, but 25-02 is a separate plan for report generation. The responsibility boundary is ambiguous | ⬜ Pending | Remove report.ts from 25-01; clarify 25-01 → 25-02 handoff |
| R3-G | 🟢 Minor | Spike | **25-00 Decision Gates are good but missing 2 new SPEC requirements** — doesn't cover `pixelmatch` threshold validation (R2-D), `sharp` install test (R2-C), or `isSystemDialog` keyword validation (R2-E) | ⬜ Pending | Add 3 new gate items to 25-00 |
| R3-H | 🟢 Minor | Spike | **25-00 Step 2.6 backtrack test uses 10 attempts, but SPEC §9.1 now requires ≥30** — SPEC was updated in R2 to "≥95% backtrack accuracy across ≥30 operations" | ⬜ Pending | Update 25-00 Step 2.6 from 10 to 30 |
| R3-I | 🟢 Minor | Scope | **25-03 config persistence misses `destructiveActionPolicy`** — SPEC §3.2 lists stored fields; `destructiveActionPolicy` should be persisted too | ⬜ Pending | Add to 25-03 config schema |

### Cross-Reference with Prior Reviews

| Review 3 Finding | Origin |
|-----------------|--------|
| R3-A, R3-B | Direct consequence of R2-A (DFS algorithm restructure) — 25-01 was written before R2-A fix |
| R3-C, R3-D | R1-#1 and R2-B added fields/signatures that 25-01 didn't pick up |
| R3-E | New finding — `@noble/hashes` not in SPEC |
| R3-F | New finding — scope ambiguity between 25-01 and 25-02 |
| R3-G | R2-D, R2-C, R2-E added spike validation requirements not in 25-00 |
| R3-H | R2's backtrack accuracy requirement update |
| R3-I | R1-#1 added destructiveActionPolicy, 25-03 didn't pick it up |

### Resolution Summary

- **2 critical gaps** (R3-A, R3-B) — 25-01 engine algorithm is structurally out of sync with SPEC's corrected DFS. Must rewrite Step 4.
- **3 important gaps** (R3-C through R3-F) — types, dependencies, and scope misalignment
- **3 minor gaps** (R3-G through R3-I) — spike coverage, test counts, config persistence
- All gaps are **caused by 25-01/25-03 being written before R1+R2 SPEC fixes**
- 25-00 is mostly aligned but needs 3 additional validation items

### Which PLANs need updates

| Plan | Gap Count | Severity | Action |
|------|-----------|----------|--------|
| 25-01 (Engine Core) | 4 (R3-A, B, C, D, E, F) | 🔴 Critical | Rewrite Step 4 algorithm, update types, remove unnecessary dep, clarify report scope |
| 25-00 (Validation Spike) | 2 (R3-G, H) | 🟢 Minor | Add 3 validation items, update backtrack test count 10→30 |
| 25-03 (Config/CLI) | 1 (R3-I) | 🟢 Minor | Add `destructiveActionPolicy` to persistence schema |
| 25-02 (Report Generator) | 0 | ✅ Aligned | No gaps found |
| 25-04 (Validation E2E) | 0 | ✅ Aligned | High-level plan, no SPEC-level detail conflict |
| 25-05 (Cross-Platform) | 0 | ✅ Aligned | High-level plan, no SPEC-level detail conflict |

---

## Review 3 — SPEC vs Sub-PLAN Alignment (2026-04-13)

Reviewer: AI coding agent (cross-document consistency review)

**Scope:** 25-SPEC.md (v3.0, post-R1+R2) vs 5 sub-PLANs (25-00 through 25-05).

**Cross-check rule:** All findings verified against the current SPEC text and the actual PLAN text. Only genuinely new gaps are listed.

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| R3-A | 🔴 Critical | Algorithm | **25-01 Step 4 `Frame` type is stale** — SPEC §4.1 rewrote Frame to include `elementIndex: number` + `elements: ClickableTarget[]`, but 25-01 Step 2 types only has `{ state, depth, path }` (the old broken version) | ✅ Fixed | Updated 25-01 Step 2 Frame type to match SPEC v3.0 |
| R3-B | 🔴 Critical | Algorithm | **25-01 Step 4 uses `for` loop with `pop()`** — the old broken DFS pattern that R2-A fixed. SPEC now uses `peek + elementIndex cursor + per-element immediate exploration`. 25-01's implementation steps still follow the old for-loop pattern | ✅ Fixed | Rewrote 25-01 Step 7 (main engine) to use corrected iterative DFS algorithm |
| R3-C | 🟡 Important | Types | **25-01 Step 2 `ExplorerConfig` missing `destructiveActionPolicy`** — SPEC §3.1 added this field, but 25-01's types.ts doesn't include it | ✅ Fixed | Added `destructiveActionPolicy` to 25-01 Step 2 types.ts |
| R3-D | 🟡 Important | Dependencies | **25-01 Step 1.2 + 4.1 use `@noble/hashes`** — SPEC §4.2 uses built-in `crypto.createHash('sha256')` for screenId hash. `@noble/hashes` is an unnecessary new dependency | ✅ Fixed | Replaced `@noble/hashes` with Node built-in `crypto` in 25-01 Step 4.1 |
| R3-E | 🟡 Important | Scope | **25-01 bundles `report.ts` but 25-02 is a separate plan** — 25-01 Step 1.5 lists `src/report.ts` in the engine package, but 25-02 is a separate plan for report generation. The responsibility boundary is ambiguous | ✅ Fixed | Clarified `report.ts` as stub in 25-01, real impl in 25-02 |
| R3-F | 🟡 Important | Implementation | **25-01 Step 4 circuit breaker uses `consecutiveFailures++` per element** — the old pre-R1-#4 pattern. SPEC now uses `consecutiveFailedPages` per-page counter | ✅ Fixed | Updated to `consecutiveFailedPages` in 25-01 Step 7 |
| R3-G | 🟡 Important | Implementation | **25-01 Step 4 `validateNavigation` not in algorithm** — SPEC added this as a critical gate after each successful tap, but 25-01's loop has no validation step between tap and push | ✅ Fixed | Added `validateNavigation` + `isSystemDialog` + `handleSystemDialog` to 25-01 Step 7 |
| R3-H | 🟢 Minor | Spike | **25-00 Step 2.6 backtrack test uses 10 attempts, but SPEC §9.1 now requires ≥30** — SPEC was updated in R2 | ✅ Fixed | Updated 25-00 Step 2.6 from 10 to 30 |
| R3-I | 🟢 Minor | Spike | **25-00 Decision Gates missing new SPEC validation items** — `pixelmatch` threshold measurement (R2-D), `sharp` install test (R2-C), `isSystemDialog` structural check (R2-E), MCP adapter confirmation (§4.8) | ✅ Fixed | Added Gate 5-8 to 25-00 |
| R3-J | 🟢 Minor | Scope | **25-03 config persistence misses `destructiveActionPolicy`** — SPEC §3.2 lists stored fields | ✅ Fixed | Added 7th interview question + persistence note in 25-03 |

### Cross-Reference with Prior Reviews

| Review 3 Finding | Origin |
|-----------------|--------|
| R3-A, R3-B | Direct consequence of R2-A (DFS algorithm restructure) — 25-01 was written before R2-A fix |
| R3-C | R1-#1 added destructiveActionPolicy, 25-01 didn't pick up |
| R3-D | New finding — `@noble/hashes` not in SPEC; unnecessary dependency |
| R3-E | New finding — scope overlap between 25-01 engine and 25-02 report |
| R3-F | R1-#4 changed circuit breaker to per-page, 25-01 didn't pick up |
| R3-G | R1-#2 added validateNavigation, 25-01 didn't pick up |
| R3-H | R2's backtrack accuracy requirement update |
| R3-I | R2-D, R2-C, R2-E, and §4.8 added validation requirements not in 25-00 |
| R3-J | R1-#1 added destructiveActionPolicy, 25-03 didn't pick it up |

### Resolution Summary

- **2 critical gaps** (R3-A, R3-B) — 25-01 engine algorithm was structurally out of sync with SPEC's corrected DFS. ✅ Fixed by rewriting Step 7 with peek + elementIndex cursor algorithm.
- **5 important gaps** (R3-C through R3-G) — types, dependencies, scope, circuit breaker, and validation missing from 25-01. ✅ Fixed.
- **3 minor gaps** (R3-H through R3-J) — spike coverage, test counts, config persistence. ✅ Fixed.
- All gaps are **caused by 25-01/25-03 being written before R1+R2 SPEC fixes**. ✅ Now aligned.
- 25-02, 25-04, and 25-05 are aligned with SPEC (no gaps found).

### Which PLANs needed updates (now all fixed)

| Plan | Gap Count | Severity | Action Taken |
|------|-----------|----------|--------|
| 25-01 (Engine Core) | 7 (R3-A through R3-G) | 🔴 Critical | ✅ Rewrote Step 7 algorithm, updated types (Step 2), removed `@noble/hashes` dep (Step 1.2 + 4.1), clarified report scope (Step 1.5), added validateNavigation/isSystemDialog/handleSystemDialog |
| 25-00 (Validation Spike) | 2 (R3-H, R3-I) | 🟢 Minor | ✅ Updated backtrack test count 10→30, added Gate 5-8 (pixelmatch threshold, sharp install, isSystemDialog, MCP adapter) |
| 25-03 (Config/CLI) | 1 (R3-J) | 🟢 Minor | ✅ Added `destructiveActionPolicy` to interview questions (7 total) + persistence note |
| 25-02 (Report Generator) | 0 | ✅ Aligned | No changes needed |
| 25-04 (Validation E2E) | 0 | ✅ Aligned | No changes needed |
| 25-05 (Cross-Platform) | 0 | ✅ Aligned | No changes needed |

---

## Review 4 — Final SPEC + Sub-PLAN Comprehensive Alignment (2026-04-13)

Reviewer: AI coding agent (final comprehensive cross-check after R1-R3 fixes)

**Scope:** SPEC.md (v3.0) + 25-00 + 25-01 + 25-02 + 25-03 + 25-04 + 25-05

### Cross-Check Matrix

| SPEC Section | 25-00 | 25-01 | 25-02 | 25-03 | Status |
|-------------|-------|-------|-------|-------|--------|
| §3.1 Config Schema (7 fields + destructiveActionPolicy) | — | ✅ Step 2 types.ts | — | ✅ 7 interview questions | ✅ Aligned |
| §3.2 Config Persistence | ✅ Gate coverage | — | — | ✅ saveConfig persists all fields | ✅ Aligned |
| §4.1 DFS Algorithm (peek + elementIndex) | ✅ Step 4 simulates correct flow | ✅ Step 7 corrected algorithm | — | — | ✅ Aligned |
| §4.2 captureSnapshot(config) | ✅ MCP tool validation | ✅ Step 5.1 accepts config | — | — | ✅ Aligned |
| §4.3 Dedup (L1/L2/L3, pixelmatch threshold TBD) | ✅ Gate 5 (threshold validation) | ✅ Step 4 uses createHash('sha256') | — | — | ✅ Aligned |
| §4.3.1 Screenshot Normalization (sharp) | ✅ Gate 6 (sharp install) | ✅ Step 4.3 uses sharp | — | — | ✅ Aligned |
| §4.4 Element Filtering (isDestructive + config) | ✅ Step 3 element type mapping | ✅ Step 3.1 passes config | — | — | ✅ Aligned |
| §4.5 Backtracking (3-tier, ≥30 ops) | ✅ Gate 3, Step 2.6 = 30 times | ✅ Step 7 navigate_back | — | — | ✅ Aligned |
| §4.6 Failure Handler | — | ✅ Step 7 handleFailure | — | — | ✅ Aligned |
| §4.7 Exploration Modes + maxPages (backtrack cost) | ✅ Gate 4 (per-page timing) | ✅ Step 7 uses config.maxPages | — | — | ✅ Aligned |
| §4.8 MCP Adapter Gate | ✅ Step 0 adapter + Gate 8 | ✅ Step 0 MCP adapter | — | — | ✅ Aligned |
| §5 Report Generator | — | ✅ Step 8 stub | ✅ Full impl | — | ✅ Aligned |
| §8 Risk Assessment | ✅ Gate coverage | ✅ Algorithm handles all risks | — | — | ✅ Aligned |
| §9.1 Acceptance Criteria | ✅ Gate 1-8 cover all | ✅ Step 7 implements | ✅ Step 3 implements | ✅ CLI implements | ✅ Aligned |

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| R4-1 | 🟢 Minor | Documentation | **25-01 Step 8 report.ts stub comment could clarify ownership** — currently says "stub for 25-01, real implementation in 25-02" which is correct but doesn't mention 25-02 is the owner | ✅ Fixed | No action needed — comment is already clear |

### Final Verdict

**SPEC + all sub-PLANs are now aligned.** No blocking gaps found.

| Document | Gap Count | Action Needed |
|----------|-----------|---------------|
| SPEC.md | 0 | ✅ Stable |
| 25-00 | 0 | ✅ Aligned with SPEC |
| 25-01 | 0 | ✅ Aligned with SPEC |
| 25-02 | 0 | ✅ Aligned with SPEC |
| 25-03 | 0 | ✅ Aligned with SPEC |
| 25-04 | 0 | ✅ Aligned with SPEC |
| 25-05 | 0 | ✅ Aligned with SPEC |

### What's Still TBD (by design, not by gap)

| Item | Where | How It Gets Resolved |
|------|-------|---------------------|
| `pixelmatch` 0.05 threshold | SPEC §4.3, 25-01 Step 4.3 | 25-00 Gate 5: empirical measurement |
| Element type names (`NavigationBarTitle`, `TabBarButton`, etc.) | SPEC §4.4, 25-01 Step 3.2 | 25-00 Step 3: real `inspect_ui` dump |
| `isSystemDialog` structural check (`accessibilityRole: 'alert'`) | SPEC §4.1, 25-01 Step 7 | 25-00 Gate 7: trigger real permission dialog |
| `avgBacktrackRate` 0.8 initial estimate | SPEC §4.7 | 25-00 Step 4.2: measure from smoke-mode walkthrough |
| MCP adapter call path | SPEC §4.8, 25-01 Step 0 | 25-00 Gate 8: grep + smoke test |

These are **intentionally deferred** — the SPEC correctly marks them as spike-validation items, not gaps.

---

## Review 5 — Repo-Truth Readiness Review (2026-04-13)

Reviewer: AI coding agent + parallel specialist review (repo-truth cross-check against live contracts/CLI)

**Scope:** `25-SPEC.md` + all sub-PLANs + `REVIEWLOG.md`, cross-checked against live repo truth in `packages/contracts`, `packages/mcp-server`, `packages/cli`, and root workspace configuration.

**Cross-check rule:** Review 4 only established **SPEC ↔ sub-PLAN textual alignment**. Review 5 adds a new validation dimension: **implementation readiness against the actual repository contracts, CLI surface, and MCP invocation model**. Findings below are therefore new blockers, not reversals of R1-R4.

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| R5-A | 🔴 Critical | MCP Contract | **25-01 MCP adapter assumes raw `boolean` / `void` / `any` returns**, but the live repo contract uses `ToolResult<TData>` envelopes with `status`, `reasonCode`, `data`, `artifacts`, and `nextSuggestions` (`packages/contracts/src/types.ts`, `packages/mcp-server/src/server.ts`). This breaks adapter, engine, and failure-handler design as written. | ✅ Fixed | Rewrote 25-01 Step 0 with confirmed `McpToolInterface` returning `ToolResult<TData>`, `unwrapResult()` helper, and consumption examples. Updated Step 5 (snapshot) and Step 7 (engine) to use camelCase methods (`launchApp`, `inspectUi`, `navigateBack`, etc.) and check `result.status` at the boundary. |
| R5-B | 🔴 Critical | Engine Coherence | **25-01 still contains internal execution/type contradictions**: `tapAndWait()` return shape does not match how Step 7 consumes `elementResult.nextState`; `snapshotter` API usage is inconsistent; `PageEntry` / `PageRegistry` data shape is mismatched. These are implementation blockers even if the spec is aligned. | ✅ Fixed | Fixed `tapAndWait` to return `{ success: true; loadTimeMs: number }` only (no `nextState`). After a successful tap, the engine now captures a fresh snapshot via `snapshotter.captureSnapshot(config)` to get the next page state. `createSnapshotter` and `createTapExecutor` now take `McpToolInterface` instead of local `MCPTools` interfaces. `validateNavigation` takes snapshot objects directly. |
| R5-C | 🔴 Critical | Validation | **25-00 and 25-04 are not yet reproducible enough to validate implementation**. Backtrack validation still conflicts internally (30 attempts in Step 2.6 vs 10 attempts in Gate 3), and 25-04 smoke/full commands do not clearly differentiate mode selection. | ✅ Fixed | 25-00 Gate 3 unified to ≥95% over 30 attempts (matching SPEC §9.1). 25-04 smoke/full commands now include `--mode smoke` / `--mode full` flags with clearly differentiated config tables. |
| R5-D | 🟡 Important | Invocation Path | **Explorer invocation architecture is still undecided in practice**. The plans retain speculative paths (direct import, HTTP/RPC, `ask_user_question`) while the live repo currently exposes a stdio/dev-CLI/server-invoke model. This creates avoidable implementation churn. | ✅ Fixed | Locked single call path in 25-01 Step 0: `MobileE2EMcpServer.invoke()` → `ToolResult<TData>` → `unwrapResult()` → engine plain types. Removed HTTP/RPC path entirely. |
| R5-E | 🟡 Important | CLI / Workspace Fit | **`npx mobile-e2e-mcp explore` is not wired into the current monorepo shape yet**. The repo already has `packages/cli` and `@shenyuexin/mobile-e2e-mcp` bin ownership, and root workspaces currently do not include `packages/explorer`. The current plans understate the integration work needed. | ✅ Fixed | 25-03 updated with CLI architecture decision: explorer is a library package (`@mobile-e2e-mcp/explorer`), no separate bin. Entry point wired through existing `packages/cli` → `packages/mcp-server` chain. 25-01 Step 1.2 `package.json` updated with workspace deps. Step 1.5 corrected to `pnpm-workspace.yaml`. 25-03 Step 2 replaced Commander.js draft with integration-point description for `explore-runner.ts`. |
| R5-F | 🟡 Important | Governance | **Review 4's "No blocking gaps found" verdict is too strong** because it did not include repo-truth validation against contracts, policy/session boundaries, or CLI reality. The review log needs a corrected readiness state so implementation does not start on a false green signal. | ✅ Fixed | Review 4 is now documented as "textually aligned only"; Review 5 findings treated as the current readiness verdict. All R5 findings now resolved. |

### Cross-Reference with Prior Reviews

| Review 5 Finding | Overlaps with Prior Review? | Why it's a new finding |
|-----------------|-----------------------------|------------------------|
| R5-A (ToolResult contract mismatch) | None | R1-R4 reviewed the planning documents internally. They did not validate the plans against live `packages/contracts` / `packages/mcp-server` return shapes. |
| R5-B (25-01 internal contradictions) | Partially beyond R3/R4 | R3/R4 fixed SPEC ↔ sub-plan drift, but did not perform a compile-level consistency pass across 25-01's own pseudo-code and type contracts. |
| R5-C (validation reproducibility gaps) | Partially beyond R2/R4 | Earlier reviews updated thresholds, but did not fully reconcile all gate text or the 25-04 smoke/full execution commands. |
| R5-D (invocation path undecided) | Related to R1-#5 / R3-I | Earlier reviews added the MCP adapter gate, but did not settle the canonical live repo integration path. |
| R5-E (CLI/workspace fit) | None | This finding only appears when comparing the plan against the actual monorepo package/CLI structure. |
| R5-F (false green readiness signal) | None | This is a meta-finding triggered by the combination of Review 4's verdict and the newly discovered repo-truth blockers. |

### Resolution Summary

- **3 critical blockers** (R5-A through R5-C) — implementation should **not start** until MCP contract shape, 25-01 internal coherence, and validation reproducibility are fixed.
- **3 important blockers** (R5-D through R5-F) — architecture path, CLI/package integration, and readiness state must be corrected before execution planning resumes.
- **No prior fix is being reverted.** Review 4 remains valid for textual alignment only; Review 5 adds a stricter repo-truth readiness gate.

### Updated Verdict

**Current status: NO-GO for implementation start.**

| Dimension | Status | Notes |
|-----------|--------|-------|
| SPEC ↔ sub-plan textual alignment | ✅ Yes | Review 4 remains valid at the document-alignment level. |
| Repo-truth contract alignment | ❌ No | 25-01 still assumes the wrong MCP/tool return model. |
| Engine execution coherence | ❌ No | 25-01 contains unresolved signature/data-flow mismatches. |
| Validation readiness | ❌ No | 25-00/25-04 still need threshold + command reconciliation. |
| CLI/package integration readiness | ⚠️ Partial | Requires explicit decision before implementation. |

### Minimum Required Revisions Before Execution

1. **Lock the canonical explorer → MCP invocation path** against the live repo architecture.
2. **Rewrite 25-01 around `ToolResult<TData>`** and make all engine/adapter signatures internally consistent.
3. **Reconcile 25-00 and 25-04 validation text** so thresholds and commands are reproducible.
4. **Document CLI/package integration scope** (`packages/explorer`, workspace registration, `mobile-e2e-mcp explore` routing).
5. **Re-run a short Review 6 readiness pass** after the above changes to confirm the phase is actually executable.

---

## Review 6 — ISSUE_LIST Tail-Clearing Review (2026-04-13)

Reviewer: AI coding agent (ISSUE_LIST.md 逐项清零验证)

**Scope:** 5 items from ISSUE_LIST.md, all must be resolved before GO signal.

### Findings

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
| R6-1 | 🔴 Critical | Package Name | **`@mobile-e2e-mcp/mcp-server` is a fake package name** — live repo uses `@shenyuexin/mobile-e2e-mcp` | ✅ Fixed | All references replaced with actual file paths (`packages/mcp-server/src/server.ts` / `packages/mcp-server/src/index.ts`). Step 0 integration path uses file paths, not package names. 25-03 CLI architecture uses `@shenyuexin/mobile-e2e-mcp`. |
| R6-2 | 🔴 Critical | ToolResult Contract | **`requestManualHandoff(): Promise<ToolResult<unknown>>` is too wide**, `takeScreenshot()` reads `filePath // or .path` (ambiguous), ScreenshotData uses `outputPath` | ✅ Fixed | `requestManualHandoff` now returns `ToolResult<RequestManualHandoffData>`. `takeScreenshot()` reads `.outputPath`. No more `unknown` or "verify from 25-00" ambiguity in return types. |
| R6-3 | 🔴 Critical | Old Interface Residue | **Step 6 still uses `interface MCPTools { navigate_back: () => Promise<boolean>; }`** — conflicts with ToolResult-aware adapter | ✅ Fixed | Step 6 `createBacktracker` now takes `McpToolInterface`, returns `Promise<boolean>` (a thin wrapper over `mcp.navigateBack()` which checks `result.status`). No old `MCPTools` interface remains. |
| R6-4 | 🟡 Important | Workspace/CLI Residue | **"pnpm-workspace.yaml needs packages/explorer added" is misleading** (already covered by `packages/*`), `mcp-tools.ts` reference outdated, CLI routing boundary unclear | ✅ Fixed | Step 1.5 simplified to "auto-included by `packages/*` glob". `mcp-tools.ts` → `mcp-adapter.ts`. CLI responsibility boundary documented: `packages/cli` = outer pass-through, `packages/mcp-server` CLI layer = subcommand routing, `packages/explorer` = library API. |
| R6-5 | 🟡 Important | Review→Body Sync | **Review 5 findings correct but body still has ambiguity** like `filePath // or .path`, `Promise<boolean>` MCP interface, fake package names | ✅ Fixed | All Review 5 blockers now resolved in body text. Step 0/5/6/7 all use `McpToolInterface → ToolResult<TData>`. No ambiguous "verify from 25-00" in critical paths. |

### GO/NO-GO Checklist (from ISSUE_LIST.md)

| Criterion | Status |
|-----------|--------|
| 文档中不再出现假的 package/import path | ✅ `@mobile-e2e-mcp/mcp-server` 已全部清除 |
| 全部 MCP 示例统一到 ToolResult\<TData> | ✅ Step 0/5/6/7 全部使用 `McpToolInterface` |
| 不再残留 boolean 风格旧接口 | ✅ `interface MCPTools { navigate_back: () => Promise<boolean> }` 已清除 |
| CLI/workspace/ownership 描述与 live repo 一致 | ✅ workspace = `packages/*` 自动包含，CLI 责任边界已明确 |

### Final Verdict

**All 5 ISSUE_LIST items resolved. No blocking gaps remain. Plans are now GO for implementation.**

---

## Review N — (template for future reviews)

| # | Severity | Category | Finding | Status | Resolution |
|---|----------|----------|---------|--------|------------|
|   |          |          |         |        |            |

### Rules for future reviews

1. **Before changing a resolved finding:** Check this log. If the finding was already reviewed and resolved, explain **why the resolution is insufficient** before proposing a different fix.
2. **Do not reverse a fix without evidence.** If Review N+1 says "Fix #3 was wrong, revert it," it must provide a concrete counter-example or test failure demonstrating the fix caused harm.
3. **Add new findings, don't edit old ones.** Append a new row with a link to the original finding number.
