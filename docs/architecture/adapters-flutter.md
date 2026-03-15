# Flutter Adapter Design

本文档定义 Flutter 场景下的执行策略、fallback 边界与治理要求，避免“语义不足 -> 无约束视觉点击”的风险。

---

## 1. 目标

- 建立 Flutter 的 deterministic-first 执行路径。
- 明确语义不足场景的有界 fallback 策略。
- 给出 Android/iOS Flutter 的分平台实现基线。

---

## 2. 代码与配置边界

- `configs/profiles/flutter.yaml`
- `packages/adapter-maestro/src/ui-model.ts`
- `packages/adapter-maestro/src/ui-runtime.ts`
- `packages/mcp-server/src/tools/perform-action-with-evidence.ts`

关联文档：

- `docs/architecture/framework-coverage.md`
- `docs/architecture/mobile-e2e-ocr-fallback-design.md`

---

## 3. 执行模型

```text
Flutter Action
  -> deterministic selector/semantic path
  -> post-condition verification
  -> if failed and policy allows: OCR/CV fallback (bounded)
  -> verify again
  -> success | fail with evidence
```

---

## 4. 能力要求

- 关键控件必须具备 semantic labels/stable keys。
- 关键业务流必须提供 deterministic start/reset 策略。
- profile 必须声明 fallback expectations。

---

## 5. 平台实现方案

### Android Flutter

- 当前仓库基线已验证 Android（见 `configs/profiles/flutter.yaml`）。
- 首选树语义路径，fallback 用于 canvas/custom painted 场景。

### iOS Flutter

- 当前为部分覆盖（尚未完全并入统一 runner/report 路径）。
- 在 iOS lane 中必须显式标记能力等级与 caveat，避免误宣称 parity。

---

## 6. 策略与风险控制

- OCR/CV 只能在 deterministic 失败后触发。
- 高风险动作（destructive/business side effects）默认禁止视觉自动执行。
- 低置信度结果必须 fail 并保留完整证据。

---

## 7. 验收指标

- Flutter 关键动作 deterministic 命中率持续提升。
- fallback trace 与证据链完整率 100%。
- Android/iOS Flutter 支持级别在能力矩阵中可核验。
