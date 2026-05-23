# Coding Conventions

**Analysis Date:** 2026-03-26

## Naming Patterns

**Files:**
- Use kebab-case TypeScript filenames for source modules: `packages/core/src/session-scheduler.ts`, `packages/adapter-vision/src/ocr/service/ocr-service.ts`, `packages/mcp-server/src/policy-guard.ts`.
- Use `index.ts` only as a package boundary or thin export/composition facade: `packages/core/src/index.ts`, `packages/adapter-maestro/src/index.ts`, `packages/mcp-server/src/index.ts`.
- Name test files after the subject with a `.test.ts` suffix under a sibling `test/` directory: `packages/core/test/session-scheduler.test.ts`, `packages/mcp-server/test/server.test.ts`.
- Use snake_case for MCP tool string ids and their matching file names in `packages/mcp-server/src/tools/`: `describe-capabilities.ts` implements `describe_capabilities`, `end-session.ts` implements `end_session`.

**Functions:**
- Use `camelCase` for functions and helpers: `runExclusive` in `packages/core/src/session-scheduler.ts`, `buildOcrEvidence` in `packages/adapter-vision/src/ocr/service/ocr-service.ts`, `extractSessionId` in `packages/mcp-server/src/policy-guard.ts`.
- Use `build*`, `load*`, `persist*`, `validate*`, `resolve*`, and `normalize*` prefixes for helper intent. Follow the existing vocabulary instead of inventing new verbs.
- Use `WithMaestro` suffix for adapter tool wrappers exposed from `packages/adapter-maestro/src/index.ts`.

**Variables:**
- Use `camelCase` for locals and parameters: `repoRoot`, `sessionId`, `minimumConfidence`, `leaseArtifactPath`.
- Use descriptive boolean names with `is*`, `has*`, or `should*`: `isGuardedPath` in `scripts/validate-pr-capability-gate.mjs`, `hasOcrFixtures` in `packages/adapter-maestro/test/ui-model.test.ts`.
- Use `UPPER_SNAKE_CASE` for shared constants: `DEFAULT_POLICY_PROFILE` in `packages/mcp-server/src/policy-guard.ts`, `REASON_CODES` in `packages/contracts/src/types.ts`.

**Types:**
- Use `PascalCase` for interfaces and type aliases: `ToolResult`, `RunExclusiveInput`, `OcrServiceResult`, `MobileE2EMcpToolRegistry`.
- Use narrow string unions for states and statuses rather than free-form strings: `OcrServiceStatus` in `packages/adapter-vision/src/ocr/service/ocr-service.ts`.

## Code Style

**Formatting:**
- Formatting tool config is not detected. No `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `biome.json`, `vitest.config.*`, or `jest.config.*` is present at repo root.
- Follow the repository’s de facto style from live files:
  - double quotes
  - semicolons
  - 2-space indentation
  - trailing commas in multiline literals
  - long named imports kept on one line until they become unwieldy, then wrapped across lines
- Keep source files in ESM/NodeNext form and use explicit relative extensions in runtime code: `./execution-coordinator.js` in `packages/core/src/session-scheduler.ts`.
- In tests, import source modules with `.ts` extensions when calling source directly via `tsx --test`: `../src/index.ts` in `packages/mcp-server/test/server.test.ts`.

**Linting:**
- Central lint orchestration exists only as `pnpm lint` in `package.json`, implemented as `pnpm -r --if-present lint`.
- No package-level `lint` scripts are detected in `package.json` or `packages/*/package.json`.
- TypeScript strictness is the primary static guardrail. Keep new code compatible with `strict: true` in `tsconfig.base.json`.

## Import Organization

**Order:**
1. Node built-ins: `node:assert/strict`, `node:fs/promises`, `node:path`, `node:test`, `node:url`
2. Workspace or external packages: `@mobile-e2e-mcp/contracts`, `@mobile-e2e-mcp/core`, `@modelcontextprotocol/sdk`
3. Relative imports with explicit extensions: `./session-record-store.js`, `../src/index.ts`

**Path Aliases:**
- Use published/workspace package names instead of tsconfig path aliases: `@mobile-e2e-mcp/contracts`, `@mobile-e2e-mcp/core`, `@mobile-e2e-mcp/adapter-maestro`, `@shenyuexin/mobile-e2e-mcp`.
- No custom `paths` aliases are configured in `tsconfig.base.json`.

## Error Handling

**Patterns:**
- Throw `Error` for local programmer/configuration failures in helpers and scripts: `assertSafeSegment` in `packages/core/src/session-scheduler.ts`, `validatePolicyProfile` in `packages/mcp-server/src/policy-guard.ts`, `scripts/release/validate-mcp-release.ts`.
- Return structured `ToolResult<T>` at tool boundaries instead of throwing. The required envelope lives in `packages/contracts/src/types.ts` and includes `status`, `reasonCode`, `artifacts`, `data`, and `nextSuggestions`.
- Use `status: "partial"` with an explicit `reasonCode` for bounded unsupported behavior instead of pretending success. Examples are asserted in `packages/mcp-server/test/server.test.ts` and `scripts/validate-dry-run.ts`.
- Prefer actionable remediation strings in `nextSuggestions` over generic failures. See `packages/mcp-server/src/tools/end-session.ts` and `packages/mcp-server/src/policy-guard.ts`.
- Preserve auditability by appending session timeline events around queueing, leasing, and handoff flows. Examples are in `packages/core/src/session-scheduler.ts` and verified in `packages/core/test/session-scheduler.test.ts` plus `packages/mcp-server/test/server.test.ts`.

## Logging

**Framework:** `console` / process stdout-stderr

**Patterns:**
- Library/package code avoids ad hoc logging and returns structured results instead.
- CLI validation scripts write machine-readable JSON to stdout and treat stderr as failure context: `scripts/validate-dry-run.ts`, `scripts/validate-concurrent-smoke.ts`, `packages/mcp-server/test/dev-cli.test.ts`.
- GitHub Actions summaries are the human-readable reporting layer. Boundary/evidence text is appended in `.github/workflows/ci.yml`, `.github/workflows/platform-smoke.yml`, and `.github/workflows/real-device-acceptance.yml`.

## Comments

**When to Comment:**
- Keep inline comments rare. Current code relies on descriptive function names and typed result shapes more than inline prose.
- Put process and policy guidance in docs instead of source comments. Examples: `AGENTS.md`, `docs/engineering/ai-first-capability-expansion-guideline.md`, `docs/delivery/npm-release-and-git-tagging.zh-CN.md`.

**JSDoc/TSDoc:**
- Not a common pattern in runtime or test code. Do not introduce large JSDoc blocks unless a file already needs API-level documentation.

## Function Design

**Size:** Prefer small single-purpose helpers that encode one policy or transformation. Representative files are `packages/core/src/session-scheduler.ts` and `packages/mcp-server/src/policy-guard.ts`.

**Parameters:** Use typed object parameters when a function has more than a few inputs or represents a contract boundary, for example `runExclusive(input, task)` in `packages/core/src/session-scheduler.ts` and `executeTextAction(input)` in `packages/adapter-vision/src/ocr/service/ocr-service.ts`.

**Return Values:** Return narrow typed objects instead of tuples or stringly typed blobs. Tool-facing functions should return `Promise<ToolResult<...>>`. Lower-level helpers can return typed records such as `RunExclusiveResult<T>` or `OcrServiceResult<T>`.

## Module Design

**Exports:**
- Prefer named exports throughout the monorepo.
- Keep package `index.ts` files focused on export assembly and top-level composition. The PR checklist in `.github/PULL_REQUEST_TEMPLATE.md` explicitly requires `packages/adapter-maestro/src/index.ts` to remain a thin facade.
- Place feature-specific logic in subject modules, not in top-level aggregators: UI logic in `packages/adapter-maestro/src/ui-*.ts`, OCR logic in `packages/adapter-vision/src/ocr/**`, policy/session logic in `packages/core/src/**`.

**Barrel Files:** Use barrel files sparingly at package boundaries only. `packages/adapter-maestro/src/ui-tools.ts` is an acceptable re-export surface because it groups adjacent UI tool modules without adding policy logic.

## Docs Sync Conventions

- Treat documentation updates as part of the feature contract, not optional cleanup. The PR checklist in `.github/PULL_REQUEST_TEMPLATE.md` requires docs updates when behavior or support boundaries change.
- For capability-governed changes, fill the `## Capability impact` fields in `.github/PULL_REQUEST_TEMPLATE.md`. The automated guard in `scripts/validate-pr-capability-gate.mjs` enforces this for changes under `packages/contracts/`, `packages/core/`, `packages/mcp-server/`, `packages/adapter-*`, `configs/`, `README*`, `docs/architecture/`, and selected `docs/engineering/` files.
- Use `docs/guides/ai-agent-invocation.zh-CN.md` as the canonical invocation guide. Topic docs such as `docs/guides/golden-path.md` and `docs/guides/record-session-quickstart.md` deliberately stay thin and point back to that source of truth.
- Use `docs/showcase/ci-evidence.md` as the fixed CI evidence entry. `README.md` and workflow summaries reference it directly.
- Follow the release doc-sync layering in `docs/delivery/npm-release-and-git-tagging.zh-CN.md`: PR gate first, release-prepare warning/check second, tag workflow fallback third. Do not require README churn when a narrower canonical guide update is sufficient.

---

*Convention analysis: 2026-03-26*
