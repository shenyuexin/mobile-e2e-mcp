# Phase 16 Plan 01 Verification

## Automated Verification

### 1. TypeScript Compilation

```
pnpm typecheck
```

**Result: PASS** — all packages compile with zero errors.

### 2. Unit Tests

```
npx tsx --test packages/adapter-maestro/test/replay-step-planner.test.ts
```

**Result: 18/18 PASS, 0 FAIL**

| Test Category | Tests | Pass |
|---|---|---|
| tapOn (selector) | 1 | 1 |
| tapOn (point / coordinate) | 1 | 1 |
| swipe | 1 | 1 |
| back | 1 | 1 |
| home | 1 | 1 |
| stopApp | 1 | 1 |
| clearState | 1 | 1 |
| killApp (unsupported) | 1 | 1 |
| assertNotVisible | 1 | 1 |
| runFlow | 1 | 1 |
| inputText | 1 | 1 |
| launchApp | 1 | 1 |
| assertVisible | 1 | 1 |
| Mixed flow | 1 | 1 |
| Step builder | 2 | 2 |
| Unsupported commands | 1 | 1 |
| Replay progress builder | 1 | 1 |
| buildInitialReplayProgress | 1 | 1 |

### 3. Bash Syntax Validation

```
bash -n scripts/dev/run-phase1-android.sh
```

**Result: PASS** — valid bash syntax.

## Manual Verification (Requires Android Device)

### 4. Owned-ADB Replay Path

```bash
# Create a simple flow with only supported commands
cat > /tmp/test-flow.yaml << 'YAML'
- launchApp:
    appId: com.example.app
- tapOn:
    point: "540,960"
- inputText: hello
- assertVisible:
    text: Welcome
- swipe:
    start: "500,1000"
    end: "500,200"
    duration: 300
- back
- home
YAML

# Run with owned-adb (no helper app needed)
ANDROID_REPLAY_BACKEND=owned-adb FLOW=/tmp/test-flow.yaml scripts/dev/run-phase1-android.sh 1
```

**Status: ⏳ PENDING** — requires real Android device.

### 5. Maestro Fallback Path

```bash
# Run a flow with unsupported command (extendedWaitUntil)
# Should fall back to maestro if helper apps installed
# Should fail gracefully if helper apps not installed
```

**Status: ⏳ PENDING** — requires real Android device.

### 6. Backend Selection

```bash
# Auto-detect (no env var)
# If dev.mobile.maestro installed → maestro
# If not installed → owned-adb

# Force owned-adb
ANDROID_REPLAY_BACKEND=owned-adb

# Force maestro
ANDROID_REPLAY_BACKEND=maestro
```

**Status: ⏳ PENDING** — requires real Android device.

## Verification Checklist

| # | Criterion | Automated | Manual | Status |
|---|---|---|---|---|
| 1 | TypeScript compiles | ✅ | — | ✅ |
| 2 | 18 replay-step-planner tests pass | ✅ (18/18) | — | ✅ |
| 3 | Bash syntax valid | ✅ | — | ✅ |
| 4 | tapOn (coordinate) executes via adb | — | ⏳ | ⏳ |
| 5 | swipe executes via adb | — | ⏳ | ⏳ |
| 6 | back/home/hideKeyboard execute via keyevent | — | ⏳ | ⏳ |
| 7 | stopApp/clearState execute via am/pm | — | ⏳ | ⏳ |
| 8 | assertNotVisible works (inverted logic) | — | ⏳ | ⏳ |
| 9 | inputText escapes spaces/special chars | — | ⏳ | ⏳ |
| 10 | Backend auto-selection works | — | ⏳ | ⏳ |
| 11 | Maestro fallback for unsupported commands | — | ⏳ | ⏳ |
| 12 | runFlow sub-flow inlining works | — | ⏳ | ⏳ |

## Verdict

**Automated verification: PASS** (18/18 tests, typecheck clean, bash syntax valid)

**Manual verification: PENDING** (requires real Android device for end-to-end replay testing)

### Outstanding Items for Manual Verification

1. **owned-adb replay on real device** — confirm all 9 new commands execute correctly via adb
2. **inputText Unicode handling** — test with non-ASCII characters (Chinese, emoji)
3. **Coordinate scaling** — test tapOn with different recording/replay resolutions
4. **Maestro fallback** — confirm fallback triggers correctly for unsupported commands
5. **Error handling** — verify failed adb commands produce clear error messages in `owned-adb-results.json`
