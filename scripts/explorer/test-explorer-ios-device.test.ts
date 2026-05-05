import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIosDeviceExplorerCliArgs,
  parseIosDeviceExplorerScriptConfig,
  renderIosDeviceExplorerHelp,
} from "./test-explorer-ios-device-lib.ts";

test("parseIosDeviceExplorerScriptConfig requires an iOS device id", () => {
  assert.throws(
    () => parseIosDeviceExplorerScriptConfig(["smoke"], {}),
    /IOS_DEVICE_ID or M2E_DEVICE_ID is required/,
  );
});

test("parseIosDeviceExplorerScriptConfig maps iPad env vars to ios-device explorer defaults", () => {
  const config = parseIosDeviceExplorerScriptConfig(["full"], {
    IOS_DEVICE_ID: "00008110-001234567890801E",
  });

  assert.equal(config.mode, "full");
  assert.equal(config.appId, "com.apple.Preferences");
  assert.equal(config.deviceId, "00008110-001234567890801E");
  assert.equal(config.outputDir, "output/evidence/explorer/ios-device-full");
  assert.equal(config.maxDepth, "8");
  assert.equal(config.timeoutMs, "7200000");
});

test("buildIosDeviceExplorerCliArgs targets ios-device Settings traversal", () => {
  const config = parseIosDeviceExplorerScriptConfig(["smoke"], {
    M2E_DEVICE_ID: "00008110-001234567890801E",
    EXPLORER_OUTPUT_DIR: "output/evidence/custom-ios-device",
    EXPLORER_MAX_DEPTH: "3",
    EXPLORER_TIMEOUT_MS: "60000",
  });

  assert.deepEqual(buildIosDeviceExplorerCliArgs(config), [
    "--mode", "smoke",
    "--app-id", "com.apple.Preferences",
    "--platform", "ios-device",
    "--no-prompt",
    "--output", "output/evidence/custom-ios-device",
    "--max-depth", "3",
    "--timeout-ms", "60000",
  ]);
});

test("renderIosDeviceExplorerHelp documents WDA and iPad usage", () => {
  const help = renderIosDeviceExplorerHelp();

  assert.match(help, /IOS_DEVICE_ID=<iPad-UDID>/);
  assert.match(help, /IOS_EXECUTION_BACKEND=wda/);
  assert.match(help, /iproxy 8100 8100 --udid/);
  assert.match(help, /--platform ios-device/);
});
