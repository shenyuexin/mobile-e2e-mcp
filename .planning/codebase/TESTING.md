# Testing Patterns

**Analysis Date:** 2026-03-26

## Test Framework

**Runner:**
- Node built-in test runner executed through `tsx --test`
- Config: Not detected; each package declares its own script in `packages/core/package.json`, `packages/adapter-vision/package.json`, `packages/adapter-maestro/package.json`, and `packages/mcp-server/package.json`

**Assertion Library:**
- `node:assert/strict`

**Run Commands:**
```bash
pnpm test:unit          # Package-level unit suites across core, adapter-vision, adapter-maestro, and mcp-server
pnpm test:smoke         # Root dry-run CLI validators and concurrency smoke
pnpm test:ci            # build + typecheck + unit + smoke
```

## Test File Organization

**Location:**
- Package unit tests live in sibling `test/` directories: `packages/core/test/*.test.ts`, `packages/adapter-vision/test/*.test.ts`, `packages/adapter-maestro/test/*.test.ts`, `packages/mcp-server/test/*.test.ts`.
- Shared fixtures live under `tests/fixtures/**`: `tests/fixtures/ui/*` and `tests/fixtures/ocr/*`.
- Root-level smoke/integration-style validators live under `scripts/validate-*.ts`.
- Testing scope and lane descriptions are documented in `tests/README.md`.

**Naming:**
- Use `<subject>.test.ts` naming that mirrors the runtime file or behavior: `packages/core/test/session-scheduler.test.ts`, `packages/adapter-vision/test/ocr.test.ts`, `packages/mcp-server/test/stdio-server.test.ts`.
- Name fixture files by scenario outcome, not by generic ids: `tests/fixtures/ocr/continue-low-confidence.png`, `tests/fixtures/ui/android-permission-dialog.xml`.

**Structure:**
```text
packages/<package>/test/*.test.ts
tests/fixtures/ui/*
tests/fixtures/ocr/*
scripts/validate-*.ts
.github/workflows/*.yml
```

## Test Structure

**Suite Organization:**
```typescript
import assert from "node:assert/strict";
import test from "node:test";

test("start_session rejects leasing the same device to another active session", async () => {
  const server = createServer();
  const result = await server.invoke("start_session", { /* ... */ });
  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "DEVICE_UNAVAILABLE");
});
```

**Patterns:**
- Write behavior-focused `test("...", async () => {})` cases instead of nested `describe` blocks. Examples: `packages/core/test/session-scheduler.test.ts`, `packages/mcp-server/test/session-lease.test.ts`.
- Build deterministic repo-root helpers once per file with `fileURLToPath(import.meta.url)` and `path.resolve(...)`. This pattern appears in nearly every package test file.
- Clean up filesystem artifacts in helper functions plus `try/finally`, not global mutable teardown. Examples: `cleanupSessionArtifact` in `packages/mcp-server/test/server.test.ts` and `cleanupSessionAndLease` in `packages/core/test/session-scheduler.test.ts`.
- Use `test.afterEach(...)` only when a suite installs global test hooks. Example: OCR fallback hooks are reset in `packages/adapter-maestro/test/ui-model.test.ts`.
- Assert machine-consumable fields, not just success booleans. Most tests check `status`, `reasonCode`, `data.*`, `nextSuggestions`, and persisted artifacts.

## Mocking

**Framework:** No mocking framework detected

**Patterns:**
```typescript
const provider = new MacVisionOcrProvider({
  execute: async () => readObservationFixture("signin-success"),
});

setOcrFallbackTestHooksForTesting({
  createProvider: () => provider,
  takeScreenshot: async () => ({ status: "success", /* ... */ }),
});
```

**What to Mock:**
- Inject fake executors or providers through constructor options and callback seams. Examples: `packages/adapter-vision/test/ocr.test.ts` and `packages/adapter-maestro/test/ui-model.test.ts`.
- Override adapter-only hooks when a test needs to isolate OCR fallback or interruption behavior: `setOcrFallbackTestHooksForTesting` and `setInterruptionGuardTestHooksForTesting` in `packages/adapter-maestro/test/ui-model.test.ts`.
- Capture CLI output by swapping `console.log` and `process.argv` inside a test-local harness instead of mocking modules globally, as in `packages/mcp-server/test/dev-cli.test.ts`.

**What NOT to Mock:**
- Do not mock the `ToolResult` contract. Tests assert the real result envelope from server, stdio, and CLI layers.
- Do not bypass filesystem-backed session/lease persistence when verifying scheduler or session behavior. Tests in `packages/core/test/session-scheduler.test.ts` and `packages/mcp-server/test/session-lease.test.ts` intentionally touch real artifact files under the repo.
- Do not replace root smoke validators with synthetic unit stubs. `scripts/validate-dry-run.ts` and `scripts/validate-concurrent-smoke.ts` are expected to exercise the real `packages/mcp-server/src/dev-cli.ts` entrypoint.

## Fixtures and Factories

**Test Data:**
```typescript
const xml = await readFile(path.join(repoRoot, "tests/fixtures/ui/android-cart.xml"), "utf8");
const nodes = parseAndroidUiHierarchyNodes(xml);

const result = await service.executeTextAction({
  action: "tap",
  targetText: "Continue",
  screenshotPath: path.join(repoRoot, "tests/fixtures/ocr/continue-success.png"),
  deterministicFailed: true,
  semanticFailed: true,
});
```

**Location:**
- UI tree fixtures: `tests/fixtures/ui/*`
- OCR screenshot triads and manifest: `tests/fixtures/ocr/*`, with provenance documented in `tests/fixtures/ocr/README.md`
- Package-local fixture payloads: `packages/adapter-maestro/test/fixtures/performance/*`

## Coverage

**Requirements:** No numeric coverage target or coverage gate is enforced. No `c8`, `nyc`, or coverage script is configured in `package.json`.

**View Coverage:**
```bash
Not applicable
```

## Test Types

**Unit Tests:**
- Pure parsing, normalization, policy, and contract checks dominate package suites.
- Representative files:
  - `packages/adapter-maestro/test/ui-model.test.ts`
  - `packages/adapter-vision/test/ocr.test.ts`
  - `packages/core/test/session-scheduler.test.ts`
  - `packages/mcp-server/test/server.test.ts`

**Integration Tests:**
- Root validators exercise the actual CLI entrypoint and parse returned JSON:
  - `scripts/validate-dry-run.ts`
  - `scripts/validate-concurrent-smoke.ts`
  - `scripts/validate-phase3-samples.ts`
- Stdio coverage sits between unit and integration by invoking `handleRequest(...)` and tool aliases in `packages/mcp-server/test/stdio-server.test.ts`.

**E2E Tests:**
- CI simulator/emulator smoke lives in `.github/workflows/platform-smoke.yml` and runs Maestro flows from `flows/samples/ci/android-settings-smoke.yaml` and `flows/samples/ci/ios-settings-smoke.yaml`.
- Real-device acceptance lives in `.github/workflows/real-device-acceptance.yml` and uploads `reports/phase-sample-report.json`, `reports/acceptance-evidence.json`, and artifacts under `artifacts/phase*`.
- OCR provider smoke is a separate macOS lane in `.github/workflows/ocr-smoke.yml` and uses committed fixture assets.

## Common Patterns

**Async Testing:**
```typescript
const [first, second] = await Promise.all([firstTask, secondTask]);
assert.equal(first.value, "first");
assert.equal(second.value, "second");
```

**Error Testing:**
```typescript
await assert.rejects(
  provider.extractTextRegions({ screenshotPath, platform: "ios" }),
);
```

## CI Flows and Evidence

- `.github/workflows/ci.yml` is the default Ubuntu gate. It runs `pnpm build`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:smoke`, then uploads metadata artifacts and appends boundary reminders pointing to `docs/showcase/ci-evidence.md`.
- `.github/workflows/ocr-smoke.yml` is path-gated to OCR code and fixture paths. Use it when changing `packages/adapter-vision/**`, `tests/fixtures/ocr/**`, or OCR maintenance scripts.
- `.github/workflows/platform-smoke.yml` validates simulator/emulator Maestro baselines only. Treat it as toolchain smoke, not proof of real-device fidelity.
- `.github/workflows/real-device-acceptance.yml` is the acceptance gate for self-hosted macOS runs. It first runs `pnpm run validate:phase3-samples`, then fails if expected lanes are missing, `NO_DATA`, or `NO_GO` in `reports/phase-sample-report.json`.
- PRs are expected to record validation evidence in `.github/PULL_REQUEST_TEMPLATE.md`, including targeted tests, environment notes, and artifacts.

## Documentation and Testing Coupling

- `tests/README.md` is the current map of regression layers and command meanings. Update it when a new lane or fixture maintenance loop changes.
- `docs/showcase/ci-evidence.md` is the canonical explanation of what CI proves and what it does not prove. Workflow summaries in `.github/workflows/ci.yml`, `.github/workflows/platform-smoke.yml`, and `.github/workflows/real-device-acceptance.yml` reinforce the same boundary language.
- `README.md` links directly to CI evidence and workflow pages. Behavior or support-boundary changes that affect validation claims should update the relevant docs and not just the test code.
- Canonical invocation docs stay centralized in `docs/guides/ai-agent-invocation.zh-CN.md`; thinner guides such as `docs/guides/golden-path.md` and `docs/guides/record-session-quickstart.md` intentionally point back to it instead of duplicating assertions that tests would have to keep in sync.

## Current Gaps

- `packages/contracts/` has schemas and type exports but no dedicated `test/` directory. Contract stability is validated indirectly through downstream package tests.
- `packages/cli/src/index.js` has no direct automated tests in the current checkout.
- Release automation under `scripts/release/*.ts` and `.github/workflows/release-mcp.yml` has validation checks, but no dedicated node:test suite.
- Default CI does not collect or enforce line/function coverage metrics.
- Real-device behavior is intentionally outside `pnpm test:ci`; confidence for those paths depends on `.github/workflows/platform-smoke.yml`, `.github/workflows/real-device-acceptance.yml`, and showcase evidence artifacts.

---

*Testing analysis: 2026-03-26*
