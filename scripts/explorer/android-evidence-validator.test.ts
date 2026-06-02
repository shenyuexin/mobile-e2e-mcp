import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { validateAndroidExplorerEvidence } from "./android-evidence-validator.ts";

function repoRootFromTest(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

describe("Android Explorer evidence validator", () => {
  it("accepts the canonical Android physical-device Explorer evidence", () => {
    const report = validateAndroidExplorerEvidence(
      path.join(repoRootFromTest(), "docs/showcase/evidence/android-explorer-full-2026-04-28T03-38-20"),
      { minPages: 45, minDepth: 4 },
    );

    assert.equal(report.schemaVersion, "android-explorer-evidence/v1");
    assert.equal(report.ok, true);
    assert.deepEqual(report.issues, []);
    assert.equal(report.summary.appId, "com.android.settings");
    assert.equal(report.summary.platform, "android-device");
    assert.equal(report.summary.mode, "full");
    assert.equal(report.summary.totalPages, 45);
    assert.equal(report.summary.totalFailures, 0);
    assert.equal(report.summary.evidenceSignals.entryProbe, true);
    assert.equal(report.summary.evidenceSignals.appSwitchDetected, true);
    assert.equal(report.summary.evidenceSignals.appSwitchRecovered, true);
  });

  it("reports missing files and failed evidence checks as machine-readable issues", () => {
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "android-explorer-evidence-"));
    writeFileSync(path.join(fixtureDir, "config.json"), JSON.stringify({
      appId: "com.example",
      platform: "android-emulator",
      mode: "smoke",
    }));

    const report = validateAndroidExplorerEvidence(fixtureDir, { minPages: 10, minDepth: 2 });

    assert.equal(report.ok, false);
    assert.ok(report.issues.includes("summary.json is missing or empty"));
    assert.ok(report.issues.includes("report.md is missing or empty"));
    assert.ok(report.issues.includes("tree.txt is missing or empty"));
    assert.ok(report.issues.includes("log.txt is missing or empty"));
    assert.ok(report.issues.some((issue) => issue.includes("config.appId expected com.android.settings")));
    assert.ok(report.issues.some((issue) => issue.includes("summary.totalPages expected >= 10")));
    assert.ok(report.issues.some((issue) => issue.includes("successful entry inspect_ui probe evidence")));
  });
});
