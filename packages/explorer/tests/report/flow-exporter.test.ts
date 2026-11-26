/**
 * Tests for deterministic Maestro smoke-flow export from Explorer paths.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  exportFlows,
  exportFlowsFromSummary,
  formatFlowYaml,
  isExportablePage,
  selectExportPaths,
  type FlowExportPage,
} from "../../src/report/flow-exporter.js";

const pages: FlowExportPage[] = [
  { id: "root", path: [], screenTitle: "Home" },
  { id: "p1", path: ["root"], viaElement: "Bluetooth", screenTitle: "Bluetooth settings" },
  { id: "p2", path: ["root", "p1"], viaElement: "Device name", screenTitle: "Device name" },
  { id: "failed", path: ["root"], viaElement: "Broken button", hasFailure: true },
  { id: "blocked", path: ["root"], viaElement: "Danger zone", stoppedByPolicy: "risk-gate" },
  {
    id: "rule-skipped",
    path: ["root"],
    viaElement: "Skipped target",
    ruleDecision: { action: "skip" },
  },
];

describe("selectExportPaths", () => {
  it("selects deepest reachable non-failed/non-blocked paths", () => {
    const selected = selectExportPaths(pages, { maxFlows: 2 });
    assert.equal(selected.length, 2);
    assert.deepEqual(selected[0]?.map((page) => page.id), ["root", "p1", "p2"]);
    assert.deepEqual(selected[1]?.map((page) => page.id), ["root", "p1"]);
    const labels = selected.flat().map((page) => page.viaElement ?? page.id);
    assert.equal(labels.includes("Broken button"), false);
    assert.equal(labels.includes("Danger zone"), false);
    assert.equal(labels.includes("Skipped target"), false);
  });

  it("classifies blocked and failed pages as non-exportable", () => {
    assert.equal(isExportablePage(pages[0] as FlowExportPage), true);
    assert.equal(isExportablePage(pages[3] as FlowExportPage), false);
    assert.equal(isExportablePage(pages[4] as FlowExportPage), false);
    assert.equal(isExportablePage(pages[5] as FlowExportPage), false);
  });
});

describe("formatFlowYaml", () => {
  it("emits launch, explicit settle delays, taps and assertions", () => {
    const yaml = formatFlowYaml({
      appId: "com.example.app",
      steps: ["Bluetooth", "Device name"],
    });
    assert.match(yaml, /^appId: "com\.example\.app"/);
    assert.match(yaml, /- launchApp:/);
    assert.match(yaml, /- waitForAnimationToEnd:\n    timeout: 3000/);
    assert.match(yaml, /- tapOn: "Bluetooth"/);
    assert.match(yaml, /- tapOn: "Device name"/);
    assert.match(yaml, /- waitForAnimationToEnd:\n    timeout: 1500/);
    assert.match(yaml, /- assertVisible: "Device name"/);
  });

  it("escapes labels deterministically", () => {
    const yaml = formatFlowYaml({ appId: 'com."example"', steps: ['Say "hi"'] });
    assert.match(yaml, /appId: "com\.\\"example\\""/);
    assert.match(yaml, /- tapOn: "Say \\"hi\\""/);
  });
});

describe("exportFlows", () => {
  it("writes deterministic flow files and skips failed/blocked paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m2e-flow-export-"));
    try {
      const flows = exportFlows(pages, "com.example.app", path.join(root, "flows"));
      assert.equal(flows.length, 2);
      const names = (await readdir(path.join(root, "flows"))).sort();
      assert.deepEqual(names, flows.map((flow) => flow.fileName).sort());
      assert.match(flows[0]?.fileName ?? "", /^smoke-01-/);

      const first = await readFile(flows[0]!.filePath, "utf-8");
      assert.match(first, /- tapOn: "Bluetooth"/);
      assert.match(first, /- tapOn: "Device name"/);
      assert.doesNotMatch(first, /Broken button|Danger zone|Skipped target/);

      const again = exportFlows(pages, "com.example.app", path.join(root, "flows-2"));
      assert.deepEqual(
        again.map((flow) => flow.yaml),
        flows.map((flow) => flow.yaml),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports from a summary.json-shaped page inventory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m2e-flow-summary-"));
    try {
      const summary = {
        runId: "run-1",
        pages: pages.slice(0, 3),
      } as Parameters<typeof exportFlowsFromSummary>[0];
      const flows = exportFlowsFromSummary(summary, "com.example.app", path.join(root, "out"));
      assert.equal(flows.length, 2);
      assert.match(flows[0]?.yaml ?? "", /appId: "com\.example\.app"/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
