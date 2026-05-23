# Plan 25-05: Cross-Platform Validation

**Parent:** Phase 25 — Full App Explorer
**Type:** Validation / E2E Test
**Dependencies:** 25-04 (iOS simulator validation passes)
**Duration:** 0.5-1 day

---

## Objective

Validate the explorer works correctly across all four target platforms and with a Tab Bar-based app.

---

## Step 1: iOS Real Device

### 1.1 Setup

- Connect iOS device via USB
- Ensure device is trusted and visible in Xcode
- Target: iOS 17+ device

### 1.2 Run exploration

```bash
npx mobile-e2e-mcp explore \
  --no-prompt \
  --app-id com.apple.Preferences \
  --platform ios-device
```

### 1.3 Validate

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| App launches on real device | ☐ | |
| Tap latency is higher than simulator (expected 2-3×) | ☐ | Avg tap time: ____ms |
| Screenshot format differs from simulator | ☐ | Format: ________ |
| `pixelmatch` works on device screenshots | ☐ | |
| Back navigation works reliably | ☐ | Success rate: ____/10 |
| Report generates correctly | ☐ | |

### 1.4 Results

| Metric | Value |
|--------|-------|
| Total pages explored | ____ |
| Total failures | ____ |
| Duration | ____s |
| Avg per-page time | ____ms |
| Exit code | ____ |

---

## Step 2: Android Emulator (API 34)

### 2.1 Setup

```bash
# Create and start Android emulator
sdkmanager "system-images;android-34;google_apis;arm64-v8a"
avdmanager create avd -n Pixel_7_API_34 -k "system-images;android-34;google_apis;arm64-v8a"
emulator -avd Pixel_7_API_34
```

### 2.2 Run exploration

```bash
npx mobile-e2e-mcp explore \
  --no-prompt \
  --app-id com.android.settings \
  --platform android-emulator
```

### 2.3 Validate

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Settings app launches on Android emulator | ☐ | |
| Element types differ from iOS (verify `isToggle`, `isInteractive`) | ☐ | Unique types: ________ |
| `navigate_back` works on Android (KEYEVENT_BACK) | ☐ | |
| Report generates correctly | ☐ | |

### 2.4 Android-Specific Element Type Check

Run `inspect_ui` on Android Settings home and record:
- [ ] Unique `elementType` values: ________
- [ ] How toggles appear: ________
- [ ] How list items appear: ________
- [ ] Update `INTERACTIVE_TYPES`, `TOGGLE_TYPES` sets in `elements.ts` if needed

### 2.5 Results

| Metric | Value |
|--------|-------|
| Total pages explored | ____ |
| Total failures | ____ |
| Duration | ____s |
| Exit code | ____ |

---

## Step 3: Android Real Device

### 3.1 Setup

- Connect Android device via USB
- Enable USB debugging
- Ensure device is visible via `adb devices`

### 3.2 Run exploration

```bash
npx mobile-e2e-mcp explore \
  --no-prompt \
  --app-id com.android.settings \
  --platform android-device
```

### 3.3 Validate

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Same as Android emulator + tap accuracy on real hardware | ☐ | |

---

## Step 4: Tab Bar App Smoke Mode

### 4.1 Select test app

Choose an app with ≥3 bottom tabs and list content:

**Minimum viable test app requirements:**
- ≥3 bottom tabs (UITabBar or React Navigation Tab)
- ≥5 navigable pages per tab (to test depth)
- No auth wall (or pre-configured test credentials)
- Builds and installs on iOS 17.4 simulator
- Uses standard navigation patterns (not custom gesture navigation)

**Option A: Team's own product app** (preferred if it meets requirements)
- Must be buildable for simulator
- Must have test credentials or no auth

**Option B: Open-source RN app with Tab Bar**
- Example: `react-native-template-typescript` demo (if it has tabs)
- Or any RN starter with bottom tabs

**Selected app:** ____________________
**App ID:** ____________________
**Meets minimum requirements?** ☐ Yes ☐ No (list gaps: ________)

### 4.2 Run smoke mode

```bash
npx mobile-e2e-mcp explore \
  --no-prompt \
  --app-id <selected-app-id> \
  --platform ios-simulator
```

### 4.3 Validate

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Smoke mode correctly identifies bottom tabs as major modules | ☐ | Tabs found: ________ |
| First list item → detail page navigation works | ☐ | |
| Report groups pages by tab correctly | ☐ | Modules: ________ |
| Each tab is a separate module in module breakdown | ☐ | |

### 4.4 Results

| Metric | Value |
|--------|-------|
| Total pages explored | ____ |
| Number of tab modules detected | ____ |
| Tab module names | ________ |
| Duration | ____s |

---

## Step 5: Cross-Platform Comparison

### 5.1 Results Summary

| Platform | Pages | Failures | Duration | Exit Code | Notes |
|----------|-------|----------|----------|-----------|-------|
| iOS Simulator | ____ | ____ | ____s | ____ | Baseline |
| iOS Device | ____ | ____ | ____s | ____ | |
| Android Emulator | ____ | ____ | ____s | ____ | |
| Android Device | ____ | ____ | ____s | ____ | |

### 5.2 Analysis

- Page count variance across platforms: <10% = Pass, 10-20% = Warning, >20% = Fail
- Any platform-specific failures: ________
- Element type rules needed platform-specific updates: ________

---

## Deliverables

- [ ] `docs/validation/25-05-cross-platform-validation.md` — results summary
  - iOS device results table
  - Android emulator results table
  - Android device results table
  - Tab Bar app smoke mode results
  - Cross-platform comparison table
  - Platform-specific element type updates
- [ ] Any element type rule fixes in `src/elements.ts`
- [ ] Any platform-specific bug fixes

---

## Acceptance Criteria

- [ ] All four platforms complete exploration without crashes
- [ ] Element filtering correctly identifies toggle cells on iOS and Android
- [ ] Smoke mode correctly explores Tab Bar app (each tab → detail page)
- [ ] Report quality consistent across all platforms
- [ ] No more than 10% difference in page count between iOS simulator and other platforms (accounting for platform-specific UI differences)
- [ ] All platform-specific element type rules updated in `elements.ts`

---

## Troubleshooting Guide

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Android element types completely different | `isInteractive()` uses iOS-only types | Add Android types to classification sets |
| Android back navigation doesn't work | `navigate_back` not implemented for Android | Check MCP tool implementation |
| Tab Bar app doesn't detect tabs | Tab bar detection logic missing | Implement tab bar detection in element prioritization |
| Device screenshots fail pixelmatch | Different resolution/format | Verify `sharp` normalization works on all screenshot formats |
