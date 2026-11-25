import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_HARNESS_CONFIG_PATH, buildDefaultDeviceId, loadHarnessSelection, parseHarnessConfig, resolveRepoPath } from "../src/harness-config.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("parseHarnessConfig fails loudly when canonical harness config is missing", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "adapter-maestro-harness-config-"));

  await assert.rejects(
    () => parseHarnessConfig(repoRoot, "configs/harness/sample-harness.yaml"),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /configs\/harness\/sample-harness\.yaml/);
      assert.match((error as Error).message, /canonical harness config is required for the repository baseline/i);
      return true;
    },
  );
});

test("loadHarnessSelection resolves real configured flutter_android profile from canonical harness config", async () => {
  const selection = await loadHarnessSelection(
    repoRoot,
    "android",
    "flutter_android",
    "configs/harness/sample-harness.yaml",
  );

  assert.equal(selection.runnerProfile, "flutter_android");
  assert.equal(selection.runnerScript.length > 0, true);
  assert.equal(selection.appId.length > 0, true);
  assert.equal(selection.configuredFlows.length > 0, true);
});

test("resolveRepoPath honors M2E_WORK_DIR override", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "adapter-maestro-workdir-"));
  const previous = process.env.M2E_WORK_DIR;
  process.env.M2E_WORK_DIR = workDir;
  try {
    assert.equal(resolveRepoPath(), path.resolve(workDir));
  } finally {
    if (previous === undefined) {
      delete process.env.M2E_WORK_DIR;
    } else {
      process.env.M2E_WORK_DIR = previous;
    }
    await rm(workDir, { recursive: true, force: true });
  }
});

test("resolveRepoPath honors MCP_EVIDENCE_DIR and buildDefaultDeviceId honors MCP_IOS_UDID/M2E_DEVICE_ID", async () => {
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), "adapter-maestro-evidence-"));
  const prevWorkDir = process.env.M2E_WORK_DIR;
  const prevEvidenceDir = process.env.MCP_EVIDENCE_DIR;
  const prevM2eDevice = process.env.M2E_DEVICE_ID;
  const prevIosUdid = process.env.MCP_IOS_UDID;

  delete process.env.M2E_WORK_DIR;
  process.env.MCP_EVIDENCE_DIR = evidenceDir;
  delete process.env.M2E_DEVICE_ID;
  process.env.MCP_IOS_UDID = "LINKNOTES-UDID-1";

  try {
    assert.equal(resolveRepoPath(), path.resolve(evidenceDir));
    assert.equal(buildDefaultDeviceId("ios"), "LINKNOTES-UDID-1");
    process.env.M2E_DEVICE_ID = "M2E-UDID-2";
    assert.equal(buildDefaultDeviceId("ios"), "M2E-UDID-2");
  } finally {
    if (prevWorkDir === undefined) delete process.env.M2E_WORK_DIR; else process.env.M2E_WORK_DIR = prevWorkDir;
    if (prevEvidenceDir === undefined) delete process.env.MCP_EVIDENCE_DIR; else process.env.MCP_EVIDENCE_DIR = prevEvidenceDir;
    if (prevM2eDevice === undefined) delete process.env.M2E_DEVICE_ID; else process.env.M2E_DEVICE_ID = prevM2eDevice;
    if (prevIosUdid === undefined) delete process.env.MCP_IOS_UDID; else process.env.MCP_IOS_UDID = prevIosUdid;
    await rm(evidenceDir, { recursive: true, force: true });
  }
});

test("loadHarnessSelection falls back to synthetic defaults when default config is absent in external workspace", async () => {
  const emptyDir = await mkdtemp(path.join(os.tmpdir(), "adapter-maestro-ext-"));
  try {
    const selection = await loadHarnessSelection(emptyDir, "ios", "native_ios", DEFAULT_HARNESS_CONFIG_PATH);
    assert.equal(selection.runnerProfile, "native_ios");
    assert.equal(selection.deviceId, undefined);
    assert.equal(selection.runCountDefault, 1);

    await assert.rejects(
      () => loadHarnessSelection(emptyDir, "ios", "native_ios", "configs/harness/custom-missing.yaml"),
      /Missing harness config: configs\/harness\/custom-missing\.yaml/,
    );
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});
