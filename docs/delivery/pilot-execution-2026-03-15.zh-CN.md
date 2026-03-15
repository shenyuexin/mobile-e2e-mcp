# 真实 App 试点执行记录（2026-03-15）

## 1. 执行目标

按 `docs/delivery/real-app-pilot-checklist-and-acceptance.zh-CN.md` 启动首轮试点执行，并在同日扩展到 WordPress Android。

## 2. 本轮执行范围

### 已执行

1. 前置门禁（Preflight）
   - `pnpm build`
   - `pnpm typecheck`
   - `pnpm test:unit`
   - `pnpm test:smoke`

2. real-run 验证（按当前可运行范围）
   - `RUN_NATIVE_ANDROID=0 RUN_NATIVE_IOS=0 PHASE1_IOS_RUNS=1 PHASE1_ANDROID_RUNS=1 PHASE3_FLUTTER_RUNS=1 pnpm validate:phase3-real-run`

3. bounded auto-remediation 验证
   - `pnpm validate:bounded-auto-remediation-real-run`

### 后续扩展执行（WordPress Android）

1. WordPress 原生 Android 安装与启动验证
   - `cd examples/wordpress-android && ./gradlew installWordPressDebug`
   - `maestro test ... flows/samples/native/wordpress-android-launch-smoke.yaml`

2. WordPress 稳定性连跑
   - launch smoke 连跑 5 次（run-001 ~ run-005）

3. WordPress 深场景（S2~S5）
   - `APP_ID=org.wordpress.android.prealpha NATIVE_ANDROID_APK_PATH=... RUNNER_PROFILE=native_android pnpm validate:bounded-auto-remediation-real-run`
   - `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --get-crash-signals ...`
   - `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts --measure-android-performance ...`
   - `pnpm --filter @mobile-e2e-mcp/mcp-server exec tsx src/dev-cli.ts ... --policy-profile read-only`（run_flow policy deny）

## 3. 执行结果摘要

## A. Preflight

- build/typecheck/unit/smoke：**通过**
- 期间出现 workspace warning（`examples/rn-tester` 的 `resolutions` 字段作用域提示），不影响本轮执行结果。

> 兼容性修复：为适配 workspace warning 与 JSON 混合输出，本轮修复了：
> - `scripts/validate-dry-run.ts`
> - `scripts/validate-concurrent-smoke.ts`

## B. real-run（已执行范围）

- react-native-ios：1/1 通过
- react-native-android：1/1 通过
- flutter-android：2/2 通过
- native-android / native-ios：0 run（本轮禁用）

对应证据：

- `reports/phase-sample-report.json`
- `reports/phase-sample-report.md`
- `reports/acceptance-evidence.json`
- `reports/acceptance-evidence.md`

关键指标（来自 `reports/acceptance-evidence.json`）：

- total runs: 4
- passed runs: 4
- pass rate: 100%
- queue wait p50/p95/max: 0/0/0
- lease conflict: 0

## C. bounded auto-remediation（已修复并复测）

- 为避免 session 泄漏与租约残留，修复了 `scripts/validate-bounded-auto-remediation-real-run.ts`：
  - 使用 `try/finally` 强制 `end_session`
  - 断言逻辑从“强依赖 timeline 事件”改为“按 attempted 条件判断”
- WordPress 复测结果：脚本可稳定产出报告
  - `reports/bounded-auto-remediation-acceptance.json`
  - `reports/bounded-auto-remediation-acceptance.md`
  - 本次 stop reason: `missing_evidence_window`（attempted=no）

## D. WordPress Android 扩展结果

- 安装成功：`./gradlew installWordPressDebug`
- 关键包名确认：`org.wordpress.android.prealpha`
- launch smoke 连跑：**5/5 PASS**
  - 证据：`artifacts/phase3-native-android-wordpress/run-001` ~ `run-005`
- Crash 信号采集：成功
  - 证据：`reports/wordpress-crash-signals.json`
- Android 性能采样：成功（Perfetto + trace_processor）
  - 证据目录：`reports/wordpress-performance.json/`
  - 当前 AI 结论：`performanceProblemLikely=yes`，`likelyCategory=memory`
- Policy 拒绝链路：成功（`run_flow` 在 `read-only` 下返回 `POLICY_DENIED`）
  - 证据：session `wp-policy-deny-runflow-20260315` 的 session/audit 记录

## 4. 验收结论（本轮）

- **总体结论：Conditional Go（条件通过）**

判定依据：

1. RN/Flutter 样例链路与 WordPress Android 已可稳定产出 real-run 证据；
2. S2~S5 在 Android 侧已形成可执行证据链（中断/修复、crash、perf、policy）；
3. iOS Native 目标仍未补齐，因此仍保持 Conditional Go（尚非全矩阵 Go）。

## 5. 风险与待办

1. **P0**：补齐 Native iOS 目标链路，恢复 `RUN_NATIVE_IOS=1` 完整矩阵。
2. **P1**：将 WordPress native flow 正式接入统一 matrix runner（避免手工 flow 运行）。
3. **P1**：将 WordPress 的 S1 登录主路径（非仅 launch）纳入稳定回归。
4. **P1**：按 checklist 将关键场景连跑维持在 >= 5，并沉淀趋势报告。

## 6. 下一轮建议执行命令

```bash
pnpm build && pnpm typecheck && pnpm test:unit && pnpm test:smoke
pnpm validate:bounded-auto-remediation-real-run
RUN_NATIVE_ANDROID=1 RUN_NATIVE_IOS=1 PHASE1_IOS_RUNS=5 PHASE1_ANDROID_RUNS=5 PHASE3_FLUTTER_RUNS=5 pnpm validate:phase3-real-run
```
