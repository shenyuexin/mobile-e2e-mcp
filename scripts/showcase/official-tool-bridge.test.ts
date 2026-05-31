import assert from "node:assert/strict";
import test from "node:test";
import { buildOfficialToolBridge, renderOfficialToolBridgeMarkdown, validateOfficialToolBridge } from "./official-tool-bridge.ts";

test("official tool bridge covers the current Android and Flutter official tools", () => {
  const bridge = buildOfficialToolBridge();

  assert.deepEqual(bridge.entries.map((entry) => entry.id), [
    "android_cli_journeys",
    "android_studio_journeys",
    "dart_flutter_mcp",
  ]);
  validateOfficialToolBridge(bridge);
});

test("official tool bridge rejects replacement positioning", () => {
  const bridge = buildOfficialToolBridge();

  assert.equal(bridge.positioning.replacementClaim, false);
  assert.equal(bridge.entries.every((entry) => entry.cannotClaim.length > 0), true);
  assert.equal(bridge.bridgeRules.some((rule) => rule.includes("replace the harness")), true);
});

test("official tool bridge keeps Flutter MCP as context provider rather than device proof", () => {
  const bridge = buildOfficialToolBridge();
  const flutter = bridge.entries.find((entry) => entry.id === "dart_flutter_mcp");

  assert.equal(flutter?.relationToMobileE2E, "upstream_context_provider");
  assert.equal(flutter?.cannotClaim.includes("standalone_device_e2e_success"), true);
});

test("official tool bridge markdown names proof intake boundary", () => {
  const markdown = renderOfficialToolBridgeMarkdown(buildOfficialToolBridge());

  assert.match(markdown, /Official Tool Bridge/);
  assert.match(markdown, /proof level/);
  assert.match(markdown, /Replacement claim: `false`/);
});
