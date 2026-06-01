import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReactNativeRuntimeContract,
  findReactNativeRuntimeMode,
  renderReactNativeRuntimeContractMarkdown,
  validateReactNativeRuntimeContract,
} from "./react-native-runtime-contract.ts";

test("runtime contract covers first-class RN modes", () => {
  const contract = buildReactNativeRuntimeContract("runtime-contract-test");
  validateReactNativeRuntimeContract(contract);

  assert.deepEqual(contract.modes.map((entry) => entry.mode), [
    "expo_go",
    "expo_dev_client",
    "bare_debug",
    "bare_release",
  ]);
});

test("debug and Expo modes require Metro inspector and JS target", () => {
  const contract = buildReactNativeRuntimeContract("runtime-contract-test");
  for (const mode of ["expo_go", "expo_dev_client", "bare_debug"] as const) {
    const entry = findReactNativeRuntimeMode(contract, mode);
    assert.equal(entry.requiresMetroInspector, true);
    assert.equal(entry.requiresJsDebugTarget, true);
  }
});

test("bare release uses native proof without Metro requirement", () => {
  const contract = buildReactNativeRuntimeContract("runtime-contract-test");
  const release = findReactNativeRuntimeMode(contract, "bare_release");

  assert.equal(release.requiresMetroInspector, false);
  assert.equal(release.requiresJsDebugTarget, false);
  assert.equal(release.requiresAppArtifact, true);
  assert.equal(release.entryStrategy, "release_artifact_launch");
});

test("runtime contract markdown includes non-mutating boundary", () => {
  const markdown = renderReactNativeRuntimeContractMarkdown(buildReactNativeRuntimeContract("runtime-contract-test"));
  assert.match(markdown, /React Native runtime contract/);
  assert.match(markdown, /does not start Metro/);
});
