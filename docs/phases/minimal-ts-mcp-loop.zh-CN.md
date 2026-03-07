# 最小 TS MCP 闭环接入记录

## TS 基线识别结果

- 仓库原先没有根 `package.json`
- 原先没有 workspace 配置
- 原先没有根 `tsconfig.json`
- `packages/mcp-server` 与 `packages/contracts` 只有 TypeScript 骨架，没有可执行 toolchain
- 唯一已接入 TypeScript 的可运行子项目是 `examples/rn-login-demo`（Expo）
- 现有可运行执行链仍是 `scripts/dev/*.sh` + `flows/*` + `scripts/report/*.py`

## 本轮调整

1. 新增仓库级 `pnpm workspace`
2. 新增统一 `tsconfig.base.json`
3. 把 `packages/contracts` 固化为共享强类型边界
4. 把 `packages/adapter-maestro` 落为最小 TS adapter，并复用现有 shell runner
5. 把 `packages/mcp-server` 接到真实 adapter，并提供 `dev-cli.ts`

## 当前最小验证入口

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm validate:dry-run
pnpm mcp:dev -- --platform android --run-count 1
```

## 已知限制

- 当前 adapter 的默认真实执行优先复用 RN sample phase runner
- 自定义 `flowPath` 还没有全面映射到各类 runner；这类输入会返回明确的部分支持状态，而不会伪装成已完成能力
- 真实执行是否通过仍取决于本机 `maestro`、模拟器、Expo dev server 等运行环境

## 下一轮建议

- 把 phase3 native/flutter 的 runner 映射也纳入 adapter
- 将 shell 脚本中的公共环境准备逻辑逐步下沉到 TS
- 增加 `doctor` 和 `list_devices` 等 MCP-ready 工具
