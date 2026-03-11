# Phase 3 self-hosted real-run 执行手册（中文版）

## 目标

把 `Phase 3` 从“有 workflow / 有脚本”推进到“可重复执行、可审计、能沉淀验收证据”的状态。

## 适用范围

- React Native Phase 1 iOS / Android
- Flutter Android sample
- Native Android sample
- Native iOS sample

## runner 要求

- GitHub Actions self-hosted runner，建议标签至少包含：`self-hosted`, `macOS`
- 已安装：`pnpm`, `Node.js 20`, `Python 3`, `maestro`, `flutter`
- iOS：可用的 Xcode simulator runtime
- Android：可用的 Android SDK、`adb`、`emulator`、至少一个 AVD

## 执行前预检

1. 清理遗留模拟器状态
2. 确认 `maestro --version`
3. 确认 `flutter --version`
4. 确认 `adb devices` 与 `xcrun simctl list devices`
5. 确认 sample app 构建产物存在或 runner 能现场构建

## 推荐执行方式

### GitHub Actions

- 手动触发：`.github/workflows/phase3-real-run.yml`
- 先跑 dry-run baseline
- 再进入 self-hosted real-run matrix

### 本机 / runner 直接执行

```bash
RUN_FLUTTER_ANDROID=1 \
RUN_NATIVE_ANDROID=1 \
RUN_NATIVE_IOS=1 \
PHASE1_IOS_RUNS=0 \
PHASE1_ANDROID_RUNS=0 \
PHASE3_FLUTTER_RUNS=1 \
PHASE3_NATIVE_ANDROID_RUNS=1 \
PHASE3_NATIVE_IOS_RUNS=1 \
pnpm run validate:phase3-real-run
```

## 产物与验收证据

执行后应至少产出：

- `reports/phase-sample-report.json`
- `reports/phase-sample-report.md`
- `reports/acceptance-evidence.json`
- `reports/acceptance-evidence.md`
- `artifacts/audit/*.json`
- 各平台 `final.jpg`、`maestro.out`、`debug/` 目录

## 判定原则

- dry-run baseline 必须通过
- real-run matrix 可以按平台部分开启，但每次必须记录跳过原因
- 验收时优先看：
  - pass rate
  - 失败样本的 `maestro.out`
  - audit 文件是否齐全
  - acceptance evidence 是否包含 run metadata 与视觉证据

## 已知边界

- Android / iOS 是否全部可跑，取决于当前 runner 的设备与构建产物
- React Native Phase 1 依赖本地 Expo/Metro 场景，通常比 sample app lane 更脆弱
- 这个 runbook 解决的是“可执行与可审计”，不是“所有 lane 必定在任意 runner 上都通过”
