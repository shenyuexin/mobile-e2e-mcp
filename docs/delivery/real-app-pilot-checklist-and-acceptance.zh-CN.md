# 真实 App 试点检查清单与验收流程（Debugger + E2E）

## 1. 目标与适用范围

本文档用于把 `mobile-e2e-mcp` 在真实业务场景中的验证流程标准化，重点回答三件事：

1. 当前能力是否在高频 Debugger + E2E 场景可稳定复用；
2. 是否达到可进入更大规模落地（Go）；
3. 哪些风险必须先收敛（No-Go 条件）。

适用范围：Android / iOS，至少覆盖 Native + React Native + Flutter 中的两类应用。

---

## 2. 试点前置条件（必须全部满足）

- [ ] 基础命令通过：`pnpm build && pnpm typecheck && pnpm test:unit`
- [ ] 干跑与样例验证通过：`pnpm test:smoke`
- [ ] 团队明确本项目定位为“编排层”，不是完整交互式调试器替代品
- [ ] 已选定试点 App 矩阵（见第 3 节）
- [ ] 已定义统一证据归档路径（session、timeline、artifacts、报告）
- [ ] 已指定 Go/No-Go 评审责任人（交付、技术、QA、治理）

> 说明：若任何一项不满足，不进入真实试点执行阶段。

---

## 3. 试点 App 矩阵（最小建议）

至少 3 个 App（可替换为你们内部 App）：

1. **React Native**：建议 `RNTester`（含 Metro 调试链路）
2. **Flutter**：建议 Flutter samples 中可稳定运行的 demo
3. **Native Android/iOS**：建议选择一个有真实用户路径的开源或内部 App

每个 App 至少覆盖以下场景：

- S1：主路径（如登录/进入首页）
- S2：中断恢复（权限弹窗/系统提醒/遮挡）
- S3：故障证据（崩溃信号、日志、时间线）
- S4：性能采样（Android Perfetto / iOS xctrace）
- S5：策略拦截（policy denied）

---

## 4. 执行检查清单（按阶段）

## A. 运行前检查

- [ ] 设备与环境可用（模拟器/真机）
- [ ] App 安装、启动、重置语义明确（可重复）
- [ ] 关键控件具备稳定标识（testID/resource-id/accessibility id）
- [ ] 已确认允许的 fallback 级别（树优先，OCR/CV 有界）

## B. 基线执行（稳定性）

- [ ] 每个场景完成首轮连跑（建议每平台每场景 >= 5 次）
- [ ] 收集并记录：pass rate、失败 reasonCode、步骤耗时、重试次数
- [ ] 失败包完整（截图 + UI 树 + 日志 + action timeline）

## C. 异常执行（韧性）

- [ ] 人为触发中断（权限弹窗/网络波动/遮挡）
- [ ] 验证 `detect -> classify -> resolve -> resume` 闭环是否成立
- [ ] 验证 bounded auto-remediation 是否按策略执行且可审计

## D. 评估与收敛

- [ ] 输出场景级结论：通过、可修复、阻塞
- [ ] 输出 Top 风险与责任人、修复截止日期
- [ ] 更新下一轮试点范围（仅扩展已稳定能力）

---

## 5. 验收指标与阈值（建议基线）

## 核心指标

1. **关键路径通过率**（按场景、按平台）
2. **失败证据完整率**（failure packet completeness）
3. **Fallback 占比**（deterministic vs OCR/CV）
4. **中断自动恢复成功率**
5. **策略执行正确率**（应放行/应拒绝）

## 建议阈值（首轮可作为 Gate）

- 关键路径通过率：>= 95%
- 失败证据完整率：>= 99%
- OCR/CV 路径占比：保持有界并持续下降（需按场景记录）
- 中断自动恢复成功率：达到团队约定阈值（建议 >= 90%）
- 策略执行正确率：100%（禁止误放行）

> 若未达到阈值：结论为 **Conditional/No-Go**，进入修复与复测，不扩大范围。

---

## 6. Go / No-Go 决策流程

## Step 1：数据汇总

- 统一汇总 `reports/phase-sample-report.json` 与 `reports/acceptance-evidence.json`
- 按平台、App、场景生成指标看板

## Step 2：技术评审

- 技术负责人确认：失败是否可归因、可复现、可回归
- QA 负责人确认：场景覆盖是否满足业务最小集
- 治理负责人确认：策略与审计链路是否可追溯

## Step 3：决策输出

- **Go**：阈值达标，允许扩大 App/设备矩阵
- **Conditional Go**：仅允许在当前已稳定矩阵继续
- **No-Go**：冻结扩展，先修复阻塞项并重跑

---

## 7. 推荐执行命令（仓库内）

```bash
pnpm build
pnpm typecheck
pnpm test:unit
pnpm test:smoke
pnpm validate:phase3-real-run
pnpm validate:bounded-auto-remediation-real-run
```

可选（OCR 相关改动时）：

```bash
pnpm validate:ocr-fixtures
pnpm test:ocr-smoke
```

---

## 8. 交付物模板（每轮试点必须产出）

- `phase-sample-report`：按场景的通过率、时延、失败归因
- `acceptance-evidence`：Go/No-Go 证据包
- 风险台账：阻塞项、负责人、修复日期、复测结果

建议复用：

- `docs/templates/acceptance-evidence-template.md`
- `docs/templates/sample-app-matrix-template.md`

---

## 9. 与现状能力边界对齐（避免误判）

- RN Debugger 当前是“快照式诊断能力”（console/network/log/crash 证据），不是完整断点调试器。
- CI 当前主链路以 no-device 回归为主，真实设备稳定性必须通过本试点流程补齐证据。
- 本项目核心竞争力在编排、治理、证据闭环；不是单一 runner 的功能堆叠。
