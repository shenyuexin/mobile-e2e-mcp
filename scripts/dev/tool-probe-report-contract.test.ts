import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAndroidResumeCheckpoint, buildAndroidToolProbeDryRunReport } from "./android-tool-probe.ts";
import { buildIosSimulatorToolProbeDryRunReport } from "./ios-simulator-tool-probe.ts";
import {
  buildProbeArtifactPaths,
  buildToolProbeReport,
  reclassifyObservedEffects,
  renderToolProbeMarkdown,
  validateToolProbeReportContract,
  type ProbeRecord,
} from "./tool-probe-report-contract.ts";

const FIXTURE_RECORDS: ProbeRecord[] = [
  { tool: "launch_app", status: "success", note: "open settings" },
  { tool: "wait_for_ui", status: "partial", reasonCode: "TIMEOUT", note: "saw live UI" },
  { tool: "perform_action_with_evidence", status: "failed", reasonCode: "OCR_NO_MATCH", note: "intentional failure" },
];

function buildFixtureReport() {
  const records = reclassifyObservedEffects(FIXTURE_RECORDS);
  return buildToolProbeReport({
    generatedAt: "2026-05-19T00:00:00.000Z",
    runId: "android-tool-probe-fixture",
    probe: "android-tool-probe",
    checklistSource: "docs/testing/android-tool-probe-checklist.md",
    sessionId: "fixture-session",
    deviceId: "fixture-device",
    platform: "android",
    runnerProfile: "phase1",
    appId: "com.android.settings",
    flowPath: "flows/samples/generated/android-settings-smoke.yaml",
    records,
    artifacts: buildProbeArtifactPaths({ probe: "android-tool-probe", runId: "android-tool-probe-fixture" }),
  });
}

describe("tool probe report contract", () => {
  it("builds a stable JSON report with computed summary counts", () => {
    const report = buildFixtureReport();

    assert.equal(report.schemaVersion, "tool-probe-report/v1");
    assert.equal(report.probe, "android-tool-probe");
    assert.equal(report.summary.total, 3);
    assert.equal(report.summary.success, 1);
    assert.equal(report.summary.partial, 1);
    assert.equal(report.summary.failed, 1);
    assert.equal(report.summary.observed, 2);
    assert.equal(report.summary.possible, 1);
    assert.equal(report.summary.notObserved, 0);
    assert.equal(report.summary.unknown, 0);
    assert.deepEqual(validateToolProbeReportContract(report), []);
  });

  it("renders Markdown with schema, identity, summary, and evidence columns", () => {
    const markdown = renderToolProbeMarkdown(buildFixtureReport(), "Android Tool Probe Report");

    assert.match(markdown, /^# Android Tool Probe Report/m);
    assert.match(markdown, /- Schema: tool-probe-report\/v1/);
    assert.match(markdown, /- Checklist: docs\/testing\/android-tool-probe-checklist\.md/);
    assert.match(markdown, /\| Tool \| Verdict \| Observed effect \| Evidence \| Reason \| Note \|/);
    assert.match(markdown, /perform_action_with_evidence/);
    assert.match(markdown, /action likely dispatched but post-action verification did not close the loop/);
  });

  it("keeps probe artifact paths stable", () => {
    assert.deepEqual(buildProbeArtifactPaths({ probe: "ios-simulator-tool-probe", runId: "run-123" }), {
      artifactJsonPath: "output/evidence/probes/ios-simulator-tool-probe/run-123/report.json",
      artifactMdPath: "output/evidence/probes/ios-simulator-tool-probe/run-123/summary.md",
      latestJsonPath: "output/reports/ios-simulator-tool-probe.json",
      latestMdPath: "output/reports/ios-simulator-tool-probe.md",
    });
  });

  it("keeps Android and iOS simulator dry-run contracts device-free", () => {
    const android = buildAndroidToolProbeDryRunReport();
    const iosSimulator = buildIosSimulatorToolProbeDryRunReport();

    assert.equal(android.requiresDevice, false);
    assert.equal(iosSimulator.requiresDevice, false);
    assert.ok(android.plannedTools.includes("validate_flow"));
    assert.ok(iosSimulator.plannedTools.includes("run_flow"));
  });

  it("builds a stable Android resume checkpoint for Settings and Bluetooth pages", () => {
    const checkpoint = buildAndroidResumeCheckpoint({
      sessionId: "fixture-session",
      platform: "android",
      actionId: "fixture-action",
      createdAt: "2026-05-22T00:00:00.000Z",
    });

    assert.equal(checkpoint.actionId, "fixture-action");
    assert.equal(checkpoint.actionType, "wait_for_ui");
    assert.equal(checkpoint.selector?.text, "Bluetooth");
    assert.equal(checkpoint.params?.text, "Bluetooth");
    assert.equal(checkpoint.params?.waitUntil, "visible");
    assert.equal(checkpoint.params?.intervalMs, 500);
    assert.equal(checkpoint.params?.timeoutMs, 8000);
    assert.notEqual(checkpoint.selector?.text, "Wi-Fi");
  });

  it("reports contract drift as validation issues", () => {
    const report = buildFixtureReport();
    report.summary.total = 99;

    assert.deepEqual(validateToolProbeReportContract(report), ["summary.total must match records"]);
  });
});
