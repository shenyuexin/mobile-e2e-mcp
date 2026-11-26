/**
 * Tests for run-to-run Explorer artifact diffing.
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  compareRunArtifacts,
  computeRunDiff,
  formatDiffMarkdown,
  loadRunArtifacts,
  parseAuditArtifact,
  type RunArtifacts,
} from "../../src/report/diff-report.js";

function page(id: string, path: string[], hasFailure: boolean) {
  return { id, screenId: `screen-${id}`, screenTitle: id, path, hasFailure };
}

async function writeRun(
  dir: string,
  input: {
    runId: string;
    pages: Array<ReturnType<typeof page>>;
    totalFailures: number;
    patterns?: Array<{ category: string; count: number }>;
    audit?: unknown;
  },
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "summary.json"),
    JSON.stringify({
      runId: input.runId,
      totalFailures: input.totalFailures,
      pages: input.pages,
    }),
    "utf-8",
  );
  await writeFile(
    path.join(dir, "failure-review.json"),
    JSON.stringify({
      runId: input.runId,
      totalFailures: input.totalFailures,
      patterns: (input.patterns ?? []).map((pattern) => ({
        category: pattern.category,
        count: pattern.count,
        failureTypes: {},
        affectedPages: [],
        examples: [],
      })),
      failedElements: [],
      nextActions: [],
    }),
    "utf-8",
  );
  if (input.audit !== undefined) {
    await writeFile(path.join(dir, "audit.json"), JSON.stringify(input.audit), "utf-8");
  }
}

describe("computeRunDiff", () => {
  it("detects new/removed pages, status + path changes, failure deltas and regressions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m2e-diff-test-"));
    try {
      const baseDir = path.join(root, "base");
      const headDir = path.join(root, "head");
      await writeRun(baseDir, {
        runId: "base-run",
        totalFailures: 1,
        pages: [
          page("p1", ["Home"], false),
          page("p2", ["Home", "Settings"], false),
          page("p3", ["Home", "Other"], false),
        ],
        patterns: [{ category: "interaction-targeting", count: 1 }],
      });
      await writeRun(headDir, {
        runId: "head-run",
        totalFailures: 3,
        pages: [
          page("p1", ["Home"], true),
          page("p2", ["Home", "Preferences"], false),
          page("p4", ["Home", "New"], false),
        ],
        patterns: [{ category: "interaction-targeting", count: 3 }],
      });

      const diff = computeRunDiff(baseDir, headDir);
      assert.equal(diff.baseRunId, "base-run");
      assert.equal(diff.headRunId, "head-run");
      assert.deepEqual(diff.newPages, ["p4"]);
      assert.deepEqual(diff.removedPages, ["p3"]);
      assert.deepEqual(diff.statusChanges, [{ pageId: "p1", from: "ok", to: "failed" }]);
      assert.equal(diff.pathChanges.length, 1);
      assert.equal(diff.pathChanges[0]?.pageId, "p2");
      assert.equal(diff.regressedPages.length, 1);
      assert.equal(diff.failurePatterns.head["interaction-targeting"], 3);
      assert.deepEqual(diff.increasedFailurePatterns, [
        { category: "interaction-targeting", base: 1, head: 3, delta: 2 },
      ]);
      assert.equal(diff.hasRegressions, true);

      const markdown = formatDiffMarkdown(diff);
      assert.match(markdown, /# Explorer run diff report/);
      assert.match(markdown, /Regression gate: FAILED/);
      assert.match(markdown, /Regressed pages/);
      assert.match(markdown, /\+2/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a clean comparison when nothing regressed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m2e-diff-clean-"));
    try {
      const baseDir = path.join(root, "base");
      const headDir = path.join(root, "head");
      const pages = [page("p1", ["Home"], false), page("p2", ["Home", "Settings"], false)];
      await writeRun(baseDir, { runId: "a", totalFailures: 0, pages });
      await writeRun(headDir, { runId: "b", totalFailures: 0, pages });

      const diff = computeRunDiff(baseDir, headDir);
      assert.equal(diff.hasRegressions, false);
      assert.deepEqual(diff.newPages, []);
      assert.deepEqual(diff.removedPages, []);
      assert.match(formatDiffMarkdown(diff), /Regression gate: passed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("UI audit delta", () => {
  it("parses ToolResult-shaped audit JSON and flags baseline regressions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m2e-diff-audit-"));
    try {
      const baseDir = path.join(root, "base");
      const headDir = path.join(root, "head");
      const pages = [page("p1", ["Home"], false)];
      await writeRun(baseDir, { runId: "a", totalFailures: 0, pages });
      await writeRun(headDir, {
        runId: "b",
        totalFailures: 0,
        pages,
        audit: {
          status: "success",
          data: {
            surfaceName: "paywall",
            baselineDiff: {
              baselinePath: ".e2e/ui-baseline.json",
              baselineFound: true,
              newRegressions: [{ category: "severeSmallTargets", fingerprint: "abc", delta: 1 }],
              newIssueCounts: { severeSmallTargets: 1, total: 1 },
            },
          },
        },
      });

      const snapshot = parseAuditArtifact(
        JSON.parse(await readFile(path.join(headDir, "audit.json"), "utf-8")),
      );
      assert.equal(snapshot?.newRegressions, 1);
      assert.equal(snapshot?.newIssueCount, 1);

      const diff = computeRunDiff(baseDir, headDir);
      assert.equal(diff.uiAudit?.headNewRegressions, 1);
      assert.equal(diff.uiAudit?.hasRegressions, true);
      assert.equal(diff.hasRegressions, true);
      assert.match(formatDiffMarkdown(diff), /UI audit new regressions/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("handles missing or malformed artifacts without throwing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "m2e-diff-missing-"));
    try {
      const empty = loadRunArtifacts(path.join(root, "missing"));
      assert.equal(empty.summary, null);
      assert.equal(empty.failureReview, null);
      assert.equal(empty.audit, null);

      const artifacts: RunArtifacts = {
        runId: "x",
        summary: null,
        failureReview: null,
        audit: null,
      };
      const comparison = compareRunArtifacts(artifacts, artifacts);
      assert.equal(comparison.hasRegressions, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
