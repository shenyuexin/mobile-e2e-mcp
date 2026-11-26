import assert from "node:assert/strict";
import test from "node:test";
import {
  CORE_TOOL_NAMES,
  REASON_CODES,
  TOOL_NAMES,
  TOOLSET_NAMES,
} from "@mobile-e2e-mcp/contracts";
import {
  buildToolListMetadata,
  buildToolsetDeniedResult,
  createServer,
  filterToolListByToolset,
  isToolEnabledInToolset,
  parseToolsetFlag,
  resolveMcpToolset,
} from "../src/index.ts";

test("CORE_TOOL_NAMES contains 20 unique registered tools from TOOL_NAMES", () => {
  const registeredTools = new Set<string>(createServer().listTools());
  const toolNameValues = new Set<string>(Object.values(TOOL_NAMES));

  assert.equal(CORE_TOOL_NAMES.length, 20);
  assert.equal(new Set(CORE_TOOL_NAMES).size, CORE_TOOL_NAMES.length);
  assert.equal(CORE_TOOL_NAMES.includes(TOOL_NAMES.recordScreen), true);
  for (const name of CORE_TOOL_NAMES) {
    assert.equal(registeredTools.has(name), true, `Expected registered tool: ${name}`);
    assert.equal(toolNameValues.has(name), true, `Expected canonical TOOL_NAMES entry: ${name}`);
  }
});

test("buildToolListMetadata filters core (20) vs full (68) and defaults to full", () => {
  const defaultTools = buildToolListMetadata();
  const fullTools = buildToolListMetadata(TOOLSET_NAMES.full);
  const coreTools = buildToolListMetadata(TOOLSET_NAMES.core);

  assert.equal(defaultTools.length, 68);
  assert.equal(fullTools.length, 68);
  assert.equal(coreTools.length, 20);
  assert.deepEqual(
    coreTools.map((tool) => tool.name).sort(),
    [...CORE_TOOL_NAMES].sort(),
  );
  assert.equal(
    filterToolListByToolset(fullTools, TOOLSET_NAMES.core).length,
    20,
  );
});

test("resolveMcpToolset respects --toolset flag > MOBILE_E2E_TOOLSET env > default core", () => {
  const defaultRes = resolveMcpToolset([], {});
  assert.equal(defaultRes.toolset, TOOLSET_NAMES.core);
  assert.equal(defaultRes.source, "default");
  assert.equal(defaultRes.error, undefined);

  const envFull = resolveMcpToolset([], { MOBILE_E2E_TOOLSET: "full" });
  assert.equal(envFull.toolset, TOOLSET_NAMES.full);
  assert.equal(envFull.source, "env");
  assert.equal(envFull.error, undefined);

  const flagOverridesEnv = resolveMcpToolset(
    ["--toolset", "core", "--other"],
    { MOBILE_E2E_TOOLSET: "full" },
  );
  assert.equal(flagOverridesEnv.toolset, TOOLSET_NAMES.core);
  assert.equal(flagOverridesEnv.source, "flag");
  assert.deepEqual(flagOverridesEnv.remainingArgs, ["--other"]);

  const equalsFlag = resolveMcpToolset(["--toolset=full"], {});
  assert.equal(equalsFlag.toolset, TOOLSET_NAMES.full);
  assert.equal(equalsFlag.source, "flag");
  assert.deepEqual(equalsFlag.remainingArgs, []);

  const invalidFlag = resolveMcpToolset(["--toolset", "lite"], {});
  assert.match(invalidFlag.error ?? "", /Invalid --toolset value "lite"/);

  const missingFlagValue = parseToolsetFlag(["--toolset"]);
  assert.match(missingFlagValue.error ?? "", /Missing value for --toolset/);

  const invalidEnv = resolveMcpToolset([], { MOBILE_E2E_TOOLSET: "minimal" });
  assert.match(invalidEnv.error ?? "", /Invalid MOBILE_E2E_TOOLSET value "minimal"/);
});

test("isToolEnabledInToolset and buildToolsetDeniedResult enforce toolset boundaries", () => {
  assert.equal(isToolEnabledInToolset(TOOL_NAMES.tapElement, TOOLSET_NAMES.core), true);
  assert.equal(isToolEnabledInToolset(TOOL_NAMES.collectDiagnostics, TOOLSET_NAMES.core), false);
  assert.equal(isToolEnabledInToolset(TOOL_NAMES.collectDiagnostics, TOOLSET_NAMES.full), true);

  const denied = buildToolsetDeniedResult(
    TOOL_NAMES.collectDiagnostics,
    TOOLSET_NAMES.core,
    "sess-123",
  );
  assert.equal(denied.status, "failed");
  assert.equal(denied.reasonCode, REASON_CODES.unsupportedOperation);
  assert.equal(denied.sessionId, "sess-123");
  assert.equal(denied.data.toolName, TOOL_NAMES.collectDiagnostics);
  assert.equal(denied.data.activeToolset, TOOLSET_NAMES.core);
  assert.equal(denied.data.requiredToolset, TOOLSET_NAMES.full);
  assert.match(denied.nextSuggestions[0] ?? "", /--toolset full/);
});
