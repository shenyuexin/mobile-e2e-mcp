# Plan 25-00: Validation Spike

**Parent:** Phase 25 — Full App Explorer
**Type:** Spike (time-boxed investigation + documentation)
**Duration:** 1.5-2 hours hands-on
**Dependencies:** iOS 17.4 Simulator available, MCP tools operational

---

## Prerequisites

### Execution Environment

This spike is executed through the MCP tool interface. Choose the appropriate execution method:

**Option A: Through AI agent's MCP tool interface (recommended)**
- Each MCP tool (`inspect_ui`, `launch_app`, etc.) is called as a tool call from the AI agent
- Output is captured in the conversation and saved to files

**Option B: Through repo CLI (if available)**
```bash
# If the repo has a CLI that wraps MCP tools:
npx mobile-e2e-mcp tools inspect-ui
```

**Option C: Through MCP server directly**
```bash
# If MCP server is running locally:
curl -X POST http://localhost:3000/tools/inspect_ui
```

**For this spike, use Option A** (AI agent tool calls). Save all JSON outputs to `docs/spike/`.

### Pre-spike Setup

```bash
# 1. Ensure iOS 17.4 Simulator is available
xcrun simctl list devices available | grep -i "iPhone\|iOS 17"

# 2. Create output directory
mkdir -p docs/spike

# 3. Boot simulator
xcrun simctl boot "iPhone 15"  # or any available iOS 17.4 device
open -a Simulator
```

---

## Step 1: Manual Inventory — iOS 17.4 Settings

### 1.1 Setup

```bash
# Open iOS 17.4 Simulator
xcrun simctl boot "iPhone 15"  # or any available iOS 17.4 device
open -a Simulator
```

### 1.2 Inventory Process

For each top-level section in Settings home screen:

| Step | Action | Record |
|------|--------|--------|
| 1 | Count total top-level sections | Number |
| 2 | For each section, tap it | Section name |
| 3 | Count navigable sub-pages (depth 1) | Number per section |
| 4 | For each sub-page, count its sub-pages (depth 2) | Number per sub-section |
| 5 | Note non-navigable items (toggles, static text, separators) | Count per section |
| 6 | Navigate back to home | Verify back works |

### 1.3 Expected Output

Create `docs/spike/settings-inventory.md`:

```markdown
# Settings Inventory — iOS 17.4 Simulator

## Top-Level Sections
| # | Section Name | Depth-1 Pages | Depth-2 Pages | Non-navigable Items |
|---|-------------|---------------|---------------|---------------------|
| 1 | Wi-Fi | 1 (Choose Network) | 0 | 3 (toggle, password field, separator) |
| 2 | Bluetooth | 1 (Paired Devices) | 0 | 2 (toggle, separator) |
| ... | ... | ... | ... | ... |

## Summary
- Total top-level sections: X
- Total depth-1 navigable pages: X
- Total depth-2 navigable pages: X
- Total navigable pages (depth 1+2): X
- Total non-navigable items: X
```

### 1.4 Success Threshold

- **Pass:** ≥20 top-level sections, ≥50 total navigable pages
- **Warning:** 30-49 total navigable pages (dedup stress test may be weak)
- **Fail:** <30 total navigable pages (need second test target)

---

## Step 2: MCP Tool Output Validation

### 2.1 launch_app

**Command:**
```json
{
  "name": "launch_app",
  "arguments": { "appId": "com.apple.Preferences" }
}
```

**Verify:**
- [ ] App launches within 5 seconds
- [ ] Reaches Settings home screen (not a sub-page)
- [ ] No permission dialogs blocking interaction
- [ ] Record launch time: ____ms

### 2.2 wait_for_ui_stable

**Command:**
```json
{
  "name": "wait_for_ui_stable",
  "arguments": { "timeoutMs": 10000 }
}
```

**Verify:**
- [ ] Returns `true` within 3 seconds
- [ ] Record stability detection time: ____ms
- [ ] If returns `false`, investigate what's animating

### 2.3 inspect_ui (CRITICAL — informs element type rules)

**Command:**
```json
{
  "name": "inspect_ui",
  "arguments": {}
}
```

**Save output to:** `docs/spike/inspect-ui-sample.json`

**Verify:**
- [ ] Response is valid JSON
- [ ] Root element represents the Settings home screen
- [ ] Element tree contains expected section names ("Wi-Fi", "Bluetooth", etc.)
- [ ] Record all unique `elementType` values found: ________
- [ ] Record all unique `accessibilityTraits` values found: ________
- [ ] Compare with spec's heuristic table (§4.4) — note mismatches:

| Spec Type | Found in Output? | Notes |
|-----------|-----------------|-------|
| Button | ☐ Yes ☐ No | |
| Cell | ☐ Yes ☐ No | |
| StaticText | ☐ Yes ☐ No | |
| Image | ☐ Yes ☐ No | |
| Switch | ☐ Yes ☐ No | |
| TextField | ☐ Yes ☐ No | |
| Other: ____ | ☐ Yes ☐ No | |

### 2.4 Toggle Cell Inspection (CRITICAL — informs isToggle detection)

Find a section with a toggle (e.g., "Cellular" → "Cellular Data Options" or "Wi-Fi" section toggle).

**Steps:**
1. Navigate to a page with a visible toggle switch
2. Run `inspect_ui`
3. Find the toggle element in the JSON tree
4. Save to `docs/spike/toggle-cell-example.json`

**Verify:**
- [ ] Toggle element has `elementType`: ________
- [ ] Toggle element has `accessibilityTraits`: ________
- [ ] Toggle element is distinguishable from navigable `Cell` elements
- [ ] Can we reliably detect toggles with the spec's `isToggle()` logic?

**If NOT distinguishable:** Document what distinguishes toggles (value field? specific traits? child elements?)

### 2.5 resolve_ui_target + tap_element

**Target:** "Wi-Fi" section on Settings home

**Build selector** per spec §4.2:
```typescript
// Try accessibilityId first
{ accessibilityId: "Wi-Fi" }
// Fallback to text + elementType
{ text: "Wi-Fi", elementType: "Cell" }
```

**Verify:**
- [ ] `resolve_ui_target` returns a resolved element
- [ ] `tap_element` succeeds (tap returns true)
- [ ] Wi-Fi settings page opens
- [ ] Record time from tap to page visible: ____ms

### 2.6 navigate_back

**Verify:**
- [ ] `navigate_back` returns to Settings home
- [ ] Home screen is recognizable (not a sub-page or error)
- [ ] Repeat **30 times** (SPEC §9.1 requires ≥95% accuracy across ≥30 operations, R2), record success rate: ____/30

### 2.7 take_screenshot

**Verify:**
- [ ] Screenshot saves successfully
- [ ] Image is readable (not black/blank)
- [ ] Image dimensions: ____x____
- [ ] File size: ____KB
- [ ] Quality sufficient for pixelmatch (text is legible at 50% zoom)

---

## Step 3: Element Type Reality Check

### 3.1 Consolidated Findings

From Step 2.3 output, create a mapping table:

```markdown
# Element Type Mapping — iOS 17.4 Settings

## elementType values found
| Value | Count | Example Elements |
|-------|-------|-----------------|
| Cell | X | Wi-Fi row, Bluetooth row |
| StaticText | X | Section headers, labels |
| Image | X | Icons, toggles |
| ... | ... | ... |

## accessibilityTraits values found
| Value | Count | Example Elements |
|-------|-------|-----------------|
| button | X | Navigable rows |
| toggleButton | X | Toggle switches |
| ... | ... | ... |
```

### 3.2 Spec Rule Validation

For each heuristic rule in spec §4.4, validate against real output:

| Rule | Validates? | Notes |
|------|-----------|-------|
| Tab bar item detection | N/A (Settings has no tab bar) | |
| List item: `elementType === 'Cell'` | ☐ Yes ☐ No | |
| Toggle: `elementType === 'Switch'` | ☐ Yes ☐ No | If not, what is it? |
| Nav hint text regex | ☐ Yes ☐ No | |
| ... | ... | ... |

**Action items from validation:**
- Rules that need updating: ________
- New element types to add: ________
- Rules to remove: ________

---

## Step 4: Quick Smoke-Mode Walkthrough

### 4.1 Process

Manually execute this flow (simulating what the engine will do):

| Step | Action | Expected Result | Time (ms) | Pass/Fail |
|------|--------|----------------|-----------|-----------|
| 1 | launch_app(Settings) | Home screen visible | | ☐ |
| 2 | wait_for_ui_stable(10s) | Returns true | | ☐ |
| 3 | inspect_ui() | UI tree captured | | ☐ |
| 4 | resolve "Wi-Fi" | Element resolved | | ☐ |
| 5 | tap_element(Wi-Fi) | Wi-Fi page opens | | ☐ |
| 6 | wait_for_ui_stable(10s) | Returns true | | ☐ |
| 7 | navigate_back() | Returns to home | | ☐ |
| 8 | wait_for_ui_stable(10s) | Returns true | | ☐ |
| 9 | resolve "General" | Element resolved | | ☐ |
| 10 | tap_element(General) | General page opens | | ☐ |
| 11 | wait_for_ui_stable(10s) | Returns true | | ☐ |
| 12 | resolve "About" | Element resolved | | ☐ |
| 13 | tap_element(About) | About page opens | | ☐ |
| 14 | wait_for_ui_stable(10s) | Returns true | | ☐ |
| 15 | navigate_back() | Returns to General | | ☐ |
| 16 | navigate_back() | Returns to home | | ☐ |

### 4.2 Summary

- Total steps: 16
- Passed: ____/16
- Failed: ____/16
- Total time: ____ms
- Average per-page time: ____ms (this becomes the initial `rollingAvgPageTimeMs`)

---

## Deliverables Checklist

- [ ] `docs/spike/settings-inventory.md` — manual page count table
- [ ] `docs/spike/inspect-ui-sample.json` — raw inspect_ui from Settings home
- [ ] `docs/spike/toggle-cell-example.json` — raw inspect_ui from a page with toggles
- [ ] `docs/spike/smoke-mode-walkthrough.md` — step-by-step results table
- [ ] Updated element type mapping table (if spec rules need changes)
- [ ] Spec document updates (if any assumptions were wrong)

---

## Decision Gates

### Gate 1: Is Settings a sufficient test target?

- **Yes** if: ≥50 total navigable pages across depth 1-2
- **No** if: <50 pages → add second target (e.g., a news app or shopping app with more depth)

### Gate 2: Are element type rules viable?

- **Yes** if: Toggle cells are distinguishable from navigable cells
- **No** if: Toggles look identical to navigable cells → redesign `isToggle()` before 25-01

### Gate 3: Is back navigation reliable?

- **Yes** if: ≥95% success rate over **30 attempts** (SPEC §9.1, R5-C unified)
- **No** if: <95% → redesign backtrack strategy (§4.5) before 25-01

### Gate 4: Is per-page timing acceptable?

- **Yes** if: average per-page time ≤15 seconds
- **No** if: >15 seconds → adjust `rollingAvgPageTimeMs` initial estimate and `minPages`/`maxPages` bounds

### Gate 5: Is `pixelmatch` threshold empirically grounded? (R2-D, R3-I)

- Take 10+ screenshots of the same Settings page at different times (varying clock, battery icon, etc.)
- Run `pixelmatch` on each pair with normalized screenshots
- Record the mismatch ratio distribution
- **Yes** if: max mismatch ratio < 0.05 (or adjust threshold based on data)
- **No** if: mismatch ratio consistently > 0.1 → investigate screenshot normalization or masking dynamic regions

### Gate 6: Does `sharp` install cleanly? (R2-C, R3-I)

- Install `sharp` on macOS (simulator machine)
- If CI is available, test installation there too
- **Yes** if: `npm install sharp` succeeds without errors
- **No** if: native binding fails → fallback to `pngjs` + manual resize

### Gate 7: Are system dialogs detectable? (R2-E, R3-I)

- Trigger a permission dialog (e.g., tap "Privacy" in Settings)
- Run `inspect_ui` on the dialog
- Check for `accessibilityRole: 'alert'` or similar structural marker
- **Yes** if: dialog has a structural marker OR consistent keyword pattern
- **No** if: dialog looks identical to a regular page → redesign `isSystemDialog` detection

### Gate 8: Is MCP adapter call path confirmed? (§4.8, R3-I)

- Run `grep -r "inspect_ui\|tap_element\|navigate_back" packages/ --include="*.ts" -l`
- Determine exact import path or endpoint URL
- **Yes** if: import path confirmed, smoke test passes
- **No** if: tools are not accessible → redesign MCP adapter architecture before 25-01

---

## Post-Spike Actions

Based on gate results:

1. **If all gates pass:** Proceed to 25-01 (Engine Core)
2. **If Gate 2 or 3 fails:** Fix spec before 25-01
   - Gate 2 fail: Update `isToggle()` detection logic in spec §4.4
   - Gate 3 fail: Add Priority 4 fallback (e.g., swipe-back gesture) to spec §4.5
3. **If Gate 1 fails:** Identify second test target and add to 25-00 scope
4. **If Gate 4 fails:** Update `rollingAvgPageTimeMs` initial estimate in spec §4.7
