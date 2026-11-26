/**
 * Tests for the self-contained single-file HTML report and report.html emission.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { FailureReview } from "../../src/report/failure-review.js";
import { createRunComparison } from "../../src/report/diff-report.js";
import { generateReport } from "../../src/report/index.js";
import { escapeHtml, formatHtmlReport, generateHtmlReport } from "../../src/report/html-report.js";
import type { ExplorerConfig, FailureEntry, PageEntry } from "../../src/types.js";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

function makePage(id: string, hasFailure = false): PageEntry {
  return {
    id,
    screenId: `screen-${id}`,
    screenTitle: id,
    path: ["Home", id],
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs: 10,
    clickableCount: 2,
    hasFailure,
    depth: 1,
    explorationStatus: "expanded",
  };
}

function makeFailure(): FailureEntry {
  return {
    pageScreenId: "screen-p1",
    elementLabel: "submit",
    failureType: "TAP_FAILED",
    retryCount: 1,
    errorMessage: "tap did not change state",
    depth: 1,
    path: ["Home", "p1"],
  };
}

function makeReview(withEvidence = false): FailureReview {
  return {
    appId: "com.example.app",
    platform: "android-emulator",
    mode: "scoped",
    status: "complete",
    durationMs: 100,
    totalPages: 2,
    totalFailures: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    patterns: [{ category: "interaction-targeting", count: 1, failureTypes: {}, affectedPages: [], examples: [] }],
    failedElements: [
      {
        pageScreenId: "screen-p1",
        screenTitle: "p1",
        elementLabel: "submit",
        failureType: "TAP_FAILED",
        retryCount: 1,
        errorMessage: "tap did not change state",
        depth: 1,
        path: ["Home", "p1"],
        ...(withEvidence
          ? {
              visualEvidence: {
                status: "captured" as const,
                screenshotPath: "visual-evidence/shot.png",
                baselineStatus: "not_configured" as const,
              },
            }
          : {}),
      },
    ],
    nextActions: [],
    artifacts: { summary: "summary.json", report: "report.md", tree: "tree.txt", config: "config.json" },
  };
}

const config: ExplorerConfig = {
  mode: "scoped",
  auth: { type: "skip-auth" },
  failureStrategy: "retry-3",
  maxDepth: 8,
  maxPages: 100,
  timeoutMs: 300_000,
  compareWith: null,
  platform: "android-emulator",
  destructiveActionPolicy: "skip",
  appId: "com.example.app",
  reportDir: "/tmp/reports",
  statefulFormPolicy: "skip",
};

describe("formatHtmlReport", () => {
  it("renders a self-contained document with KPIs, tables, and failure details", () => {
    const comparison = createRunComparison({
      runId: "head-run",
      pages: [makePage("p1", true), makePage("p2")],
      failures: [makeFailure()],
      failureReview: makeReview(),
    });
    const html = formatHtmlReport(comparison, { title: "PR report" });

    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<style>/);
    assert.match(html, /<script>/);
    assert.match(html, /<title>PR report<\/title>/);
    assert.match(html, /Regression gate: FAILED/);
    assert.match(html, /Pages added/);
    assert.match(html, /Regressed pages/);
    assert.match(html, /Failure pattern delta/);
    assert.match(html, /submit/);
    assert.match(html, /single-file report/);

    assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)\s*=\s*["']https?:/i);
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']\/\/cdn\./i);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.equal(generateHtmlReport(comparison), formatHtmlReport(comparison));
  });

  it("escapes untrusted text", () => {
    assert.equal(escapeHtml('<img src="x" onerror="alert(1)">'), "&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;");
  });

  it("embeds local image evidence as base64 and links local videos relatively", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-html-evidence-"));
    try {
      await mkdir(path.join(dir, "visual-evidence"), { recursive: true });
      await writeFile(path.join(dir, "visual-evidence", "shot.png"), Buffer.from(TINY_PNG_BASE64, "base64"));
      await writeFile(path.join(dir, "recording.mp4"), Buffer.from("fake video"));

      const comparison = createRunComparison({
        runId: "head-run",
        dir,
        pages: [makePage("p1", true)],
        failures: [makeFailure()],
        failureReview: makeReview(true),
      });
      const html = formatHtmlReport(comparison, {
        artifactDir: dir,
        outputPath: path.join(dir, "report.html"),
      });

      assert.match(html, /data:image\/png;base64,/);
      assert.match(html, /href="\.\/recording\.mp4"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("generateReport", () => {
  it("emits report.html alongside the existing artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-report-html-"));
    try {
      const reportDir = path.join(dir, "reports");
      const localConfig: ExplorerConfig = { ...config, reportDir };
      await generateReport([makePage("p1"), makePage("p2")], [makeFailure()], localConfig, {
        partial: false,
        durationMs: 250,
        runId: "run-1",
      });

      const runDir = path.join(reportDir, "run-1");
      const html = await readFile(path.join(runDir, "report.html"), "utf-8");
      assert.match(html, /^<!doctype html>/);
      assert.match(html, /<style>/);
      assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)\s*=\s*["']https?:/i);
      for (const existing of [
        "report.md",
        "summary.json",
        "failure-review.json",
        "failure-review.md",
        "tree.txt",
        "config.json",
        "index.json",
      ]) {
        const location = existing === "index.json" ? path.join(reportDir, existing) : path.join(runDir, existing);
        assert.equal((await readFile(location, "utf-8")).length > 0, true, `${existing} should still be written`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
