import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildSessionRecordRelativePath } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

test("server supports external workspace via M2E_WORK_DIR and iOS launchEnv dry-run without leaking secrets", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "m2e-ext-workspace-"));
  const previousWorkDir = process.env.M2E_WORK_DIR;
  process.env.M2E_WORK_DIR = workDir;
  const sessionId = `ext-ios-${Date.now()}`;
  const server = createServer();

  try {
    const startResult = await server.invoke("start_session", {
      sessionId,
      platform: "ios",
      deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
      appId: "com.timeone.linknotes",
      profile: "native_ios",
      policyProfile: "interactive",
    });

    assert.equal(startResult.status, "success");
    assert.equal(existsSync(path.join(workDir, buildSessionRecordRelativePath(sessionId))), true);

    const launchResult = await server.invoke("launch_app", {
      sessionId,
      platform: "ios",
      deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
      appId: "com.timeone.linknotes",
      launchEnv: {
        LINKNOTES_UI_TESTING: "1",
        LINKNOTES_TEST_SESSION_TOKEN: "secret-tok",
      },
      launchArgs: ["-UITestMode"],
      dryRun: true,
    });

    assert.equal(launchResult.status, "success");
    assert.equal(launchResult.data.runnerProfile, "native_ios");
    assert.equal(launchResult.data.launchCommand.includes("--terminate-running-process"), true);
    assert.equal(launchResult.data.launchCommand.includes("com.timeone.linknotes"), true);
    assert.equal(launchResult.data.launchCommand.includes("-UITestMode"), true);
    assert.deepEqual(launchResult.data.launchEnvKeys, [
      "LINKNOTES_TEST_SESSION_TOKEN",
      "LINKNOTES_UI_TESTING",
    ]);
    assert.equal(JSON.stringify(launchResult).includes("secret-tok"), false);

    const invalidEnvResult = await server.invoke("launch_app", {
      sessionId,
      platform: "ios",
      deviceId: "FB1859DD-41E1-4DAC-8031-6E831DC5CB04",
      appId: "com.timeone.linknotes",
      launchEnv: {
        "BAD-KEY": "1",
      },
      dryRun: true,
    });

    assert.equal(invalidEnvResult.status, "failed");
    assert.equal(invalidEnvResult.reasonCode, "CONFIGURATION_ERROR");

    const endResult = await server.invoke("end_session", { sessionId });
    assert.equal(endResult.status, "success");
  } finally {
    if (previousWorkDir === undefined) {
      delete process.env.M2E_WORK_DIR;
    } else {
      process.env.M2E_WORK_DIR = previousWorkDir;
    }
    await rm(workDir, { recursive: true, force: true });
  }
});
