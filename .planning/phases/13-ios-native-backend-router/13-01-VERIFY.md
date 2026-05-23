# Phase 13 Plan 01 Verification

## Automated Verification

### 1. TypeScript Compilation

```
pnpm typecheck
```

Result: **PASS** — all 7 packages compile with zero errors.

### 2. Build

```
pnpm build
```

Result: **PASS** — all packages build successfully.

### 3. New Backend Tests

```
npx tsx --test \
  packages/adapter-maestro/test/ios-backend-simctl.test.ts \
  packages/adapter-maestro/test/ios-backend-router.test.ts \
  packages/adapter-maestro/test/doctor-guidance.test.ts \
  packages/adapter-maestro/test/device-runtime-ios.test.ts
```

Result: **30/30 pass, 0 fail**

| Test File | Tests | Pass | Fail |
|---|---|---|---|
| `ios-backend-simctl.test.ts` | 16 | 16 | 0 |
| `ios-backend-router.test.ts` | 10 | 10 | 0 |
| `doctor-guidance.test.ts` | 3 | 3 | 0 |
| `device-runtime-ios.test.ts` | 1 | 1 | 0 |

### 4. Previously-Failing Tests (Fixed)

```
npx tsx --test --test-name-pattern="previews iOS|simctl install|appends simctl" \
  packages/adapter-maestro/test/doctor-guidance.test.ts \
  packages/adapter-maestro/test/ui-model.test.ts
```

Result: **4/4 pass, 0 fail**

| Test | Before | After |
|---|---|---|
| `buildDoctorNextSuggestions appends simctl install guidance` | ❌ (idb assertion) | ✅ |
| `typeTextWithMaestro previews iOS text entry in dry-run mode` | ❌ (idb "ui" keyword) | ✅ |
| `tapWithMaestro previews iOS coordinate tap in dry-run mode` | ❌ (idb "ui" keyword) | ✅ |

## Manual Verification (Requires macOS with Xcode)

### 5. Backend Detection

```bash
cd /Users/linan/Documents/mobile-e2e-mcp
pnpm mcp:dev
# Call `doctor` tool — verify output shows:
# ✓ xcrun simctl (with Xcode version)
# ✓ xcrun devicectl (with Xcode version)
# ✓ maestro (if installed)
# ⚠ idb (deprecated, if installed)
```

Status: ⏳ **Not run** — requires macOS dev environment.

### 6. Simulator Hierarchy Capture

```bash
# Boot a simulator
xcrun simctl boot "iPhone 15"
xcrun simctl list devices  # get UDID

# Test hierarchy capture
xcrun simctl spawn <UDID> accessibility dump | head -20
# Verify JSON output is parseable by parseIosInspectNodes()
```

Status: ⏳ **Not run** — requires booted simulator.

### 7. Simulator Tap/Type/Swipe

```bash
# Tap
xcrun simctl io <UDID> tap 200 400

# Type
xcrun simctl keyboard <UDID> type -- "hello world"

# Swipe
xcrun simctl io <UDID> swipe 200 600 200 200

# Screenshot
xcrun simctl io <UDID> screenshot /tmp/test.png
```

Status: ⏳ **Not run** — requires booted simulator.

### 8. Backend Selection via Env Var

```bash
# Force simctl
IOS_EXECUTION_BACKEND=simctl node -e "..."

# Force devicectl
IOS_EXECUTION_BACKEND=devicectl node -e "..."

# Invalid value → throws
IOS_EXECUTION_BACKEND=invalid node -e "..."

# Deprecated idb → warns
IOS_EXECUTION_BACKEND=idb node -e "..."
```

Status: ⏳ **Not run** — requires manual verification.

## Verification Checklist

| # | Criterion | Automated | Manual | Status |
|---|---|---|---|---|
| 1 | TypeScript compiles | ✅ | — | ✅ |
| 2 | Build succeeds | ✅ | — | ✅ |
| 3 | New backend tests pass | ✅ (26/26) | — | ✅ |
| 4 | Previously-failing tests fixed | ✅ (4/4) | — | ✅ |
| 5 | Doctor shows new backends | — | ⏳ | ⏳ |
| 6 | simctl hierarchy capture works | — | ⏳ | ⏳ |
| 7 | simctl tap/type/swipe work | — | ⏳ | ⏳ |
| 8 | Env var backend selection works | ✅ (unit) | ⏳ | ⏳ |
| 9 | simctl `accessibility dump` format matches idb JSON | — | ⏳ | ⏳ |
| 10 | Physical device devicectl probe works | — | ⏳ | ⏳ |

## Verdict

**Automated verification: PASS** (typecheck, build, 30/30 tests)

**Manual verification: PENDING** (requires macOS with Xcode and a booted simulator)

### Outstanding Items for Manual Verification

1. **simctl `accessibility dump` output format** — highest risk. If the output is not JSON-compatible with `parseIosInspectNodes()`, a compatibility shim parser is needed.

2. **simctl UI actions on live simulator** — verify tap, type, swipe, screenshot commands actually work end-to-end.

3. **devicectl probe on physical device** — verify `xcrun devicectl help` succeeds on Xcode 14+ with a connected device.

4. **Doctor tool output** — verify the formatted doctor output shows all 4 backends (simctl, devicectl, maestro, idb-deprecated) with correct statuses.
