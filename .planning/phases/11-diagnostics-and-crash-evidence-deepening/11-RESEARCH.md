# Phase 11: Research — Diagnostics and Crash Evidence Deepening

**Date:** 2026-04-05

## Research Questions Answered

### Q1: How does the current Android crash signal collection work?

**Answer:** Located in `packages/adapter-maestro/src/device-runtime-android.ts` → `executeCrashSignalsCapture`.

Two commands are executed sequentially:
1. `adb -s <deviceId> logcat --pid <PID> -d -b crash -t <lines>` — crash buffer
2. `adb -s <deviceId> shell ls -1 /data/anr` — ANR file listing

The output is combined into a single text file with markdown headers:
```
# Android crash log buffer
<crash logcat output>

# Android ANR entries
<filename list from ls>
```

**Gap identified:** The ANR section only contains filenames, not content. No `adb pull` or `adb shell cat` is performed.

### Q2: How does the current iOS crash signal collection work?

**Answer:** Located in `packages/adapter-maestro/src/device-runtime-ios.ts` → `executeCrashSignalsCapture`.

For **simulators only**:
1. `xcrun simctl getenv <deviceId> HOME` → gets simulator home path
2. Reads `~/Library/Logs/CrashReporter/` directly from Mac filesystem
3. Reads up to 3 crash files, truncating each to 80 lines

**Gap identified:** No path for physical iOS devices. `isIosPhysicalDeviceId(deviceId)` is not checked in this function — the current code assumes simulator.

### Q3: What tools are available for iOS physical device crash log collection?

**Answer:** Three tiers, from most to least reliable:

**Tier 1: `xcrun devicectl device info crashes`** (Xcode 14+, macOS Ventura+)
- No additional installation needed if Xcode is present
- Returns JSON with crash report metadata
- Requires device to be paired and trusted
- Command shape:
  ```bash
  xcrun devicectl device info crashes --device <udid> --timeout 10
  ```

**Tier 2: `idevicecrashreport`** (libimobiledevice)
- Requires `brew install libimobiledevice`
- Can pull crash logs from physical device
- Command shape:
  ```bash
  idevicecrashreport -k <local-dir> --udid <udid>
  ```
- `-k` flag: keep crash reports on device (non-destructive)
- After pulling, `.crash` files can be parsed locally

**Tier 3: `idevicesyslog`** (libimobiledevice)
- Also requires libimobiledevice
- Streams syslog from device
- Won't get full crash reports, but can capture crash messages
- Command shape:
  ```bash
  idevicesyslog --udid <udid> -n 500
  ```

### Q4: What's the format of Android ANR trace files?

**Answer:** ANR traces at `/data/anr/` follow this structure:

```
----- pid 12345 at 2026-04-05 10:30:00 -----
Cmd line: com.example.app

JNI: CheckJNI is off; globals=500 (plus 200 weak)

"main" prio=5 tid=1 Native
  | group="main" sCount=1 dsCount=0 flags=1 obj=0x7123456789 self=0xb400007123456789
  | sysTid=12345 nice=-10 cgrp=default sched=0/0 handle=0x7123456789
  | state=S schedstat=( 123456789 12345678 12345 ) utm=12 stm=12 core=0 HZ=100
  | stack=0x7ffe123456-0x7ffe678901 stackSize=8192KB
  | held mutexes=
  at android.view.ViewRootImpl$ViewRootHandler.handleMessage(ViewRootImpl.java:5546)
  at android.os.Handler.dispatchMessage(Handler.java:106)
  at android.os.Looper.loopOnce(Looper.java:226)
  at android.os.Looper.loop(Looper.java:313)
  at android.app.ActivityThread.main(ActivityThread.java:8751)
  at java.lang.reflect.Method.invoke(Native method)
  at com.android.internal.os.RuntimeInit$MethodAndArgsCaller.run(RuntimeInit.java:571)
  at com.android.internal.os.ZygoteInit.main(ZygoteInit.java:1067)

"Binder:12345_1" prio=5 tid=2 Native
  ... (similar format)
```

Key extractable fields:
- **Process name**: `Cmd line:` line
- **PID**: `----- pid (\d+)` line
- **Thread name + state**: `"name" ... state=X tid=N`
- **Stack trace**: `at package.Class.method(File.java:line)` lines
- **Top frame**: first `at` line of each thread

**Note:** Reading `/data/anr/` may require root access on production devices. On emulators and eng/userdebug builds, it works without root.

### Q5: What's the format of iOS crash reports?

**Answer:** iOS `.crash` files (both simulator and physical device) follow this structure:

```
Incident Identifier: XXXX-XXXX-XXXX-XXXX
CrashReporter Key:   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Hardware Model:      iPhone15,2
Process:             MyApp [1234]
Path:                /private/var/containers/Bundle/Application/.../MyApp.app/MyApp
Identifier:          com.example.MyApp
Version:             1.0 (1)
Code Type:           ARM-64
Role:                Foreground
Parent Process:      launchd [1]

Date/Time:           2026-04-05 10:30:00.000 +0000
Launch Time:         2026-04-05 10:29:00.000 +0000
OS Version:          iPhone OS 17.4 (21E219)
Report Version:      104

Exception Type:  EXC_BAD_ACCESS (SIGSEGV)
Exception Subtype: KERN_INVALID_ADDRESS at 0x0000000000000010
Exception Codes: 0x0000000000000001, 0x0000000000000010

Triggered by Thread:  0

Thread 0 Crashed:
 0   MyApp                    0x0000000100abc123 functionA + 50
 1   MyApp                    0x0000000100abc456 functionB + 100
 2   libsystem_pthread.dylib  0x00000001f0000000 _pthread_start + 120
 ...
```

Key extractable fields:
- **Process name**: `Process:` line (includes PID in brackets)
- **Exception type**: `Exception Type:` line
- **Exception codes**: `Exception Codes:` line
- **Crashed thread**: `Triggered by Thread:` + corresponding `Thread N Crashed:` section
- **Stack frames**: lines starting with frame number + binary name + address

### Q6: How does `buildLogSummary` currently work?

**Answer:** Located in `packages/adapter-maestro/src/device-runtime.ts`:

1. Split content by newlines
2. Filter lines matching `isInterestingDebugLine` (checks for "error", "exception", "crash", "fatal", etc.)
3. Classify each line into a category via `classifyDebugSignal`
4. Bucket by `${category}:${line}` key, count occurrences
5. Return top 8 signals + 8 sample lines

**Limitations:**
- Only works on log text, not on structured crash reports
- No crash type detection (ANR vs native crash vs OOM)
- No attribution (process name, crashed thread, suspected cause)
- No actionable suggestions

### Q7: What existing patterns can we reuse?

**Answer:**

| Pattern | Location | Reusable for |
|---|---|---|
| `executeRunner` | `runtime-shared.ts` | All adb/xcrun/idevice commands |
| `buildFailureAttribution` | `action-outcome.ts` | Structured crash attribution pattern |
| `buildIosLogPredicateForApp` | `device-runtime-ios.ts` | App filtering for crash logs |
| `listRelativeFileEntries` | `device-runtime-ios.ts` | Recursive crash log directory scanning |
| `resolveAndroidAppPid` | `device-runtime-android.ts` | PID resolution for ANR trace correlation |
| Tool response envelope | `contracts/types.ts` | New `CrashAttribution` field shape |

### Q8: Does `adb pull /data/anr/` work on production devices?

**Answer:** Mixed results:

- **Emulators**: ✅ Works without restrictions
- **Userdebug/eng builds**: ✅ Usually works
- **Production user builds**: ❌ Often requires root access

**Workarounds:**
1. `adb shell cat /data/anr/<file>` — works on some devices without full pull permission (still reads via shell)
2. `adb shell "cat /data/anr/<file> | head -500"` — bounded read, avoids large file issues
3. `adb bugreport` — includes ANR traces in the bugreport bundle (already used in `collect_diagnostics`)

**Decision:** For Phase 11, implement `adb shell cat` as the primary path (works on more devices than `pull`), with `adb pull` as fallback. Both should have timeout and size guardrails.

### Q9: How does the existing `collect_diagnostics` tool relate?

**Answer:** `collect_diagnostics` already calls `adb bugreport` which includes ANR traces. However:
- `bugreport` takes 30-120 seconds to complete
- It generates a large bundle (50-200MB)
- It's a "nuclear option" — overkill for just getting crash signals
- The traces are buried deep inside the zip, requiring extraction

**Phase 11's targeted approach is complementary:**
- `get_crash_signals` → fast (5-10s), targeted crash/ANR evidence
- `collect_diagnostics` → slow (30-120s), comprehensive device state

Both should remain as separate tools with different use cases.

---

## Key Decisions Made During Research

1. **ANR pull method**: Use `adb shell cat` as primary (broader compatibility), `adb pull` as fallback
2. **iOS physical device**: Tier 1 = `devicectl` (no extra deps), Tier 2 = `idevicecrashreport`, Tier 3 = `idevicesyslog`
3. **Crash attribution**: New `buildCrashAttribution` function in `action-outcome.ts`, not modifying `buildLogSummary`
4. **Size limit**: 2MB default for individual trace files, 30s total budget for batch pulls
5. **Timeout**: 10s per file pull, 5s for size check
