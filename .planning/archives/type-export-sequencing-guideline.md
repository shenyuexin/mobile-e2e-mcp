# Type Export Sequencing Guideline

> 目的：减少“先改消费方、后补导出层”导致的 TypeScript 类型导出错误。

## 适用场景

当修改以下任一层时，必须按固定顺序推进：

- `packages/contracts/src/types.ts`
- `packages/contracts/src/index.ts`
- 任何 `@mobile-e2e-mcp/contracts` 的消费方（adapter / mcp-server / cli）

---

## 规则：先定义，再导出，再消费

### 正确顺序

1. **先在 `packages/contracts/src/types.ts` 定义新类型/字段**
2. **再在 `packages/contracts/src/index.ts` 补导出**
3. **然后再修改消费方 import 与使用逻辑**
4. **最后跑一次最小 build/typecheck**

### 错误顺序（禁止）

1. 先在 adapter / mcp-server / cli 中 import 新类型
2. 再回头补 `types.ts`
3. 最后才发现 `index.ts` 没导出

这种顺序最容易触发：

- `Module has no exported member ...`
- LSP 误报/滞后错误
- 一层修完、另一层还没接上的短暂不一致

---

## 推荐执行模板

### 新增类型时

```text
Step 1: edit packages/contracts/src/types.ts
Step 2: edit packages/contracts/src/index.ts
Step 3: run lsp_diagnostics or package build for contracts
Step 4: update consumer imports/usages
Step 5: run project typecheck
```

### 新增 `RunFlowInput` 字段时

```text
1. types.ts: add field/interface/union
2. index.ts: export the new types
3. mcp-server: update tool wrapper / CLI input mapping
4. adapter: consume the field in routing logic
5. verify: build contracts -> build adapter/mcp-server -> typecheck
```

---

## 最小自检清单

在改消费方之前，先确认：

- [ ] 新类型已存在于 `types.ts`
- [ ] 新类型已从 `contracts/src/index.ts` 导出
- [ ] `pnpm --filter @mobile-e2e-mcp/contracts build` 已通过

在改完消费方之后，再确认：

- [ ] adapter build 通过
- [ ] mcp-server build 通过
- [ ] workspace `typecheck` 通过

---

## 经验结论

如果某次改动横跨 **contracts → adapter → mcp-server → cli**，
不要按“文件正在报错的顺序”修，应该按“类型传播链的上游到下游”修。

> 口诀：**定义在前，导出在前，消费在后。**
