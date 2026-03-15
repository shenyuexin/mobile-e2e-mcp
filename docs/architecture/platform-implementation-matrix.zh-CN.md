# 跨平台实现矩阵（Android / iOS / React Native / Flutter）

本文档用于把“能力定义”映射为“平台可执行基线”，并标注支持等级、限制、fallback 与治理要求。

---

## 1. 支持等级定义

- **Supported**：可稳定用于生产级自动化。
- **Partial**：可用但有明确限制，需要附带 caveat。
- **Unsupported**：当前不提供或仅概念设计。

---

## 2. 能力矩阵（当前仓库基线）

| 能力域 | Android | iOS | React Native | Flutter |
|---|---|---|---|---|
| Device/App 生命周期 | Supported | Supported | 复用平台能力（Supported） | 复用平台能力（Android Supported, iOS Partial） |
| UI inspect/query/resolve | Supported | Partial（idb hierarchy 基线） | 复用平台 + debug 补充（Partial+） | 依赖语义质量（Partial） |
| tap/type/wait/flow | Supported | Partial（idb 路径） | 复用平台执行 lane（Partial） | Android Partial，iOS Partial |
| interruption handling | Supported（规则基线） | Supported（规则基线） | 复用平台 interruption flow | 复用平台 interruption flow |
| OCR fallback | 有界支持 | 有界支持 | 有界支持 | 有界支持（更常见） |
| JS debug observability | N/A | N/A | Supported（snapshot 模式） | N/A |
| governance/policy guard | Supported | Supported | Supported | Supported |

---

## 3. 平台关键限制

### Android

- OEM 差异导致弹窗和权限行为碎片化。
- 建议使用 vendor profile 承载差异规则。

### iOS

- 当前仓库以 `idb` 为层级与动作主路径，非 full WDA parity。
- selector 能力边界需对调用方显式暴露。

### React Native

- Debug 能力是 observability lane，不等价于 full debugger。
- 自动化执行仍依赖平台 adapter。

### Flutter

- 语义标签质量决定 deterministic 成功率。
- 对 custom-painted 场景 fallback 频率较高。

---

## 4. 每行能力必须声明的字段

- preconditions
- determinism tier (D0/D1/D2)
- allowed fallback level
- required policy scope
- emitted telemetry/artifacts
- caveats/unsupported

---

## 5. 维护机制

1. 每次工具能力变化同步更新矩阵。
2. 与 `framework-coverage.md`、`capability-map.md` 保持术语一致。
3. 在 PR 中要求“能力变更 -> 文档矩阵变更”联动。
