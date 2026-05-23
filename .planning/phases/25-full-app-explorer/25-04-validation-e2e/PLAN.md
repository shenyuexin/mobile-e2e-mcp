# Plan 25-04: Validation — Settings App E2E

**Parent:** Phase 25 — Full App Explorer
**Type:** Validation / E2E Test
**Dependencies:** 25-00 (spike baseline), 25-01 (engine), 25-02 (report), 25-03 (CLI)
**Duration:** 0.5-1 day

---

## Objective

Run the full explorer on iOS 17.4 Settings simulator and validate output against the manual baseline from 25-00.

---

## Step 1: Run Full Exploration

### 1.1 Smoke mode run

```bash
cd packages/explorer
npx mobile-e2e-mcp explore \
  --no-prompt \
  --mode smoke \
  --app-id com.apple.Preferences \
  --platform ios-simulator
```

**Config (defaults for smoke mode):**
| Parameter | Value |
|-----------|-------|
| mode | **smoke** |
| failureStrategy | retry-3 |
| maxDepth | 5 |
| timeoutMs | 480000 (8 min) |

### 1.2 Full mode run

```bash
npx mobile-e2e-mcp explore \
  --no-prompt \
  --mode full \
  --app-id com.apple.Preferences \
  --platform ios-simulator
```

**Config (defaults for full mode):**
| Parameter | Value |
|-----------|-------|
| mode | **full** |
| failureStrategy | retry-3 |
| maxDepth | 8 |
| timeoutMs | 1800000 (30 min) |

### 1.3 Record Results

After each run, record:
- [ ] Exit code (0=complete, 2=partial)
- [ ] Duration: ____s
- [ ] Total pages explored: ____
- [ ] Total failures: ____
- [ ] Max depth reached: ____
- [ ] Report generated: `reports/{run-id}/report.md`
- [ ] Graph generated: `reports/{run-id}/graph.mmd`

---

## Step 2: Validate Against Manual Baseline

### 2.1 Compare with 25-00 inventory

Open `docs/spike/settings-inventory.md` from 25-00 and compare:

| Metric | 25-00 Baseline | Smoke Run | Full Run |
|--------|---------------|-----------|----------|
| Total top-level sections | ____ | ____ | ____ |
| Total navigable pages | ____ | ____ | ____ |
| Max depth | ____ | ____ | ____ |

### 2.2 Analysis

- **Pass:** Automated count within ±10% of manual baseline
- **Warning:** Automated count within ±20% of manual baseline
- **Fail:** Automated count >20% different from manual baseline

**If fail, investigate:**
- [ ] Are toggle cells being incorrectly classified as navigable?
- [ ] Are some navigable cells being missed by element classification?
- [ ] Is dedup over-aggressive (marking different pages as duplicates)?
- [ ] Is backtracking failing (missing pages because can't return)?

---

## Step 3: Dedup Accuracy Check

### 3.1 Spot-check report for false positives

Open `reports/{run-id}/report.md` and check:

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| No obviously different pages grouped together | ☐ | |
| L1 dedup (text hash) catches obvious duplicates | ☐ | |
| L3 dedup (pixelmatch) correctly distinguishes similar pages | ☐ | |

### 3.2 Count false positives manually

From the full run report:
- Total unique pages reported: ____
- Pages that look like false positives (same page counted multiple times): ____
- False positive rate: ____%

**Target:** <5%

### 3.3 Count false negatives manually

- Pages that should be different but were merged: ____
- False negative rate: ____%

**Target:** <2%

---

## Step 4: Backtrack Reliability Check

### 4.1 Review report for backtrack failures

Search `reports/{run-id}/summary.json` for `BACKTRACK_MISMATCH` failures.

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| No more than 5% backtrack failures | ☐ | ____/____ failures |
| Navigation paths make sense (no impossible jumps) | ☐ | |
| Home screen is reachable after full exploration | ☐ | |

---

## Step 5: Report Quality Check

### 5.1 File structure

Verify `reports/{run-id}/` contains:
- [ ] `summary.json` — valid JSON with all required fields
- [ ] `report.md` — renders in VS Code Markdown preview
- [ ] `graph.mmd` — renders in Mermaid live editor or VS Code
- [ ] `config.json` — matches the config used
- [ ] `pages/page-001-*/ui-tree.json` — valid JSON
- [ ] `pages/page-001-*/screenshot.png` — readable image
- [ ] `pages/page-001-*/clickable-elements.json` — non-empty array
- [ ] `pages/page-001-*/metadata.json` — valid JSON

### 5.2 index.json

- [ ] `reports/index.json` exists and contains this run
- [ ] Run entry has correct `id`, `appId`, `platform`, `mode`
- [ ] `pageCount` matches `summary.json` total pages

---

## Deliverables

- [ ] `docs/validation/25-04-settings-validation.md` — validation report
  - Smoke run results table
  - Full run results table
  - Baseline comparison table
  - Dedup accuracy findings
  - Backtrack reliability findings
  - Report quality checklist
- [ ] Any bug fixes or spec updates discovered during validation

---

## Acceptance Criteria

- [ ] Automated page count within ±10% of manual baseline from 25-00
- [ ] Dedup false positive rate <5%
- [ ] Dedup false negative rate <2%
- [ ] No more than 5% backtrack failures
- [ ] Report renders correctly in VS Code Markdown preview
- [ ] Mermaid graph renders correctly
- [ ] All per-page artifacts contain valid data
- [ ] `index.json` is correctly updated

---

## Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Page count much higher than baseline | Toggle cells not filtered | Fix `isToggle()` in elements.ts |
| Page count much lower than baseline | Backtrack failures causing missed pages | Fix backtrack.ts |
| Many "structurally-similar-but-visually-different" warnings | L2 too aggressive, L3 not running | Check pixelmatch setup |
| Report shows 0 pages | Engine not running or MCP tools not connected | Check CLI + MCP integration |
| Graph shows disconnected nodes | `arrivedFrom` not being set | Check snapshot tracking in engine |

---

## Failure Recovery Strategy

If validation fails, follow this decision tree:

### Level 1: Fix and re-run (single component fix)

| Failure | Fix In | Re-run |
|---------|--------|--------|
| Dedup accuracy <5% false positive | `src/dedup.ts` — adjust threshold or hash | 25-04 Step 3 |
| Dedup accuracy <2% false negative | `src/dedup.ts` — adjust pixelmatch threshold | 25-04 Step 3 |
| Backtrack failures >5% | `src/backtrack.ts` — add Priority 2/3 fallback | 25-04 Step 4 |
| Element filtering wrong | `src/elements.ts` — update type sets from 25-00 data | 25-04 Step 2 |

### Level 2: Fix and re-run (multi-component fix)

| Failure | Fix In | Re-run |
|---------|--------|--------|
| Engine crashes on real app | `src/engine.ts` + `src/snapshot.ts` — error handling | 25-04 Step 1 |
| MCP adapter broken | `src/mcp-adapter.ts` — verify tool calls | 25-04 Step 1 |
| Report files missing | `src/report.ts` — check file writing | 25-04 Step 5 |

### Level 3: Go back to spec

If 3+ Level 1 or 2 fixes fail:
1. Revisit 25-00 decision gates
2. Check if Gate 2 (element types) or Gate 3 (back navigation) actually passed
3. If gates were wrong → fix spec → re-implement → restart 25-04
