/**
 * Tests for Explorer failure review artifacts.
 *
 * The failure review is a diagnostic companion to report.md, not a replacement.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateFailureReviewJson,
  generateFailureReviewMarkdown,
  parseExplorerLogSignals,
} from "../../src/report/failure-review.js";
import type { ExplorerConfig, FailureEntry, PageEntry } from "../../src/types.js";

function makePage(id: string, depth: number, path: string[]): PageEntry {
  return {
    id,
    screenId: `screen-${id}`,
    screenTitle: id,
    depth,
    path,
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs: 100,
    clickableCount: 5,
    hasFailure: false,
  };
}

function makeFailure(overrides: Partial<FailureEntry> = {}): FailureEntry {
  return {
    pageScreenId: "screen-settings",
    elementLabel: "See All App & Website Activity",
    failureType: "BACKTRACK_MISMATCH",
    retryCount: 1,
    errorMessage:
      'ensureFrameAligned mismatch for "See All App & Website Activity"',
    depth: 2,
    path: ["com.apple.settings.screenTime", "See All App & Website Activity"],
    ...overrides,
  };
}

const mockConfig: ExplorerConfig = {
  mode: "full",
  auth: { type: "skip-auth" },
  failureStrategy: "retry-3",
  maxDepth: 8,
  maxPages: 100,
  timeoutMs: 300_000,
  compareWith: null,
  platform: "ios-device",
  destructiveActionPolicy: "skip",
  appId: "com.apple.Preferences",
  reportDir: "/tmp/reports",
};

describe("generateFailureReviewJson", () => {
  it("groups backtrack mismatches and emits actionable navigation suggestions", () => {
    const review = generateFailureReviewJson(
      [makePage("settings", 0, []), makePage("screen-time", 2, ["Settings"])],
      [makeFailure()],
      mockConfig,
      { partial: false, durationMs: 12_000 },
    );

    assert.equal(review.totalFailures, 1);
    assert.equal(review.patterns[0]?.category, "navigation-backtrack");
    assert.equal(review.patterns[0]?.failureTypes.BACKTRACK_MISMATCH, 1);
    assert.ok(
      review.nextActions.some((action) =>
        action.includes("navigate_back") && action.includes("fallback"),
      ),
    );
  });

  it("summarizes rule decisions as diagnostic context", () => {
    const page = makePage("settings", 0, []);
    page.ruleDecisions = [
      {
        ruleId: "default.element.help.low-value-skip",
        category: "low-value-content",
        action: "skip-element",
        reason: "Help pages are low value",
        path: ["Settings", "Help"],
        elementLabel: "Help",
      },
    ];

    const review = generateFailureReviewJson([page], [makeFailure()], mockConfig, {
      partial: false,
      durationMs: 12_000,
    });

    assert.equal(review.ruleDecisionContext?.total, 1);
    assert.equal(
      review.ruleDecisionContext?.byRuleId["default.element.help.low-value-skip"],
      1,
    );
  });

  it("includes log-derived backtrack and device signals when log text is provided", () => {
    const logText = [
      '[2026-05-12T08:00:04.909+08:00] [LOG] [BACKTRACK-WARN] method=navigate_back:selector_tap, status=failed, reason=NO_MATCH, executed=unsupported, stateChanged=unknown, pageTreeHashUnchanged=unknown, fallbackUsed=false => rejected by contract check',
      '[2026-05-12T08:02:47.699+08:00] [LOG] [BACKTRACK-WARN] method=tap_back_button:contentDesc, selector="INSTALLED FONTS", coordinate=n/a, status=partial, reason=NO_MATCH, executedStrategy=tap_element => transition rejected',
      '[2026-05-12T08:03:07.811+08:00] [LOG] [BACKTRACK-TRACE] method=tap_point_band_back, point=left-nav-tight-upper, x=24, y=81, status=success, reason=OK => success',
      "No connected/matching device found, disconnecting client.",
      'CoreDeviceError Code=1002 "No provider was found."',
    ].join("\n");

    const review = generateFailureReviewJson(
      [makePage("settings", 0, [])],
      [makeFailure()],
      mockConfig,
      { partial: false, durationMs: 12_000, logText },
    );

    assert.equal(review.logSignals?.backtrackWarnings.total, 2);
    assert.equal(review.logSignals?.backtrackSuccesses.total, 1);
    assert.equal(
      review.logSignals?.backtrackWarnings.byMethod["navigate_back:selector_tap"],
      1,
    );
    assert.equal(review.logSignals?.reasonCodes.NO_MATCH, 2);
    assert.equal(review.logSignals?.deviceConnectivity.usbmuxNotFound, 1);
    assert.equal(review.logSignals?.deviceConnectivity.coreDeviceProviderMissing, 1);
    assert.ok(
      review.nextActions.some((action) => action.includes("tap_point_band_back")),
    );
  });
});

describe("parseExplorerLogSignals", () => {
  it("summarizes backtrack attempts, reason codes, and device connectivity failures", () => {
    const signals = parseExplorerLogSignals(
      [
        "[BACKTRACK-WARN] method=navigate_back:selector_tap, status=failed, reason=NO_MATCH, executed=unsupported",
        "[BACKTRACK-WARN] method=tap_back_button:text, status=partial, reason=AMBIGUOUS_MATCH, executedStrategy=tap_element",
        "[BACKTRACK-TRACE] method=tap_point_band_back, status=success, reason=OK => success",
        "iproxy: No connected/matching device found, disconnecting client.",
      ].join("\n"),
    );

    assert.equal(signals.backtrackWarnings.total, 2);
    assert.equal(signals.backtrackSuccesses.total, 1);
    assert.equal(signals.reasonCodes.NO_MATCH, 1);
    assert.equal(signals.reasonCodes.AMBIGUOUS_MATCH, 1);
    assert.equal(signals.deviceConnectivity.usbmuxNotFound, 1);
    assert.deepEqual(signals.examples.map((example) => example.level), [
      "warn",
      "warn",
      "success",
      "device",
    ]);
  });
});

describe("generateFailureReviewMarkdown", () => {
  it("renders a focused failure-review document", () => {
    const review = generateFailureReviewJson(
      [makePage("settings", 0, [])],
      [makeFailure()],
      mockConfig,
      { partial: false, durationMs: 12_000 },
    );
    const md = generateFailureReviewMarkdown(review);

    assert.ok(md.includes("# Explorer Failure Review"));
    assert.ok(md.includes("navigation-backtrack"));
    assert.ok(md.includes("See All App & Website Activity"));
    assert.ok(md.includes("summary.json"));
    assert.ok(md.includes("report.md"));
  });

  it("renders log signal diagnostics when available", () => {
    const review = generateFailureReviewJson(
      [makePage("settings", 0, [])],
      [makeFailure()],
      mockConfig,
      {
        partial: false,
        durationMs: 12_000,
        logText:
          "[BACKTRACK-WARN] method=navigate_back:selector_tap, status=failed, reason=NO_MATCH\n" +
          "[BACKTRACK-TRACE] method=tap_point_band_back, status=success, reason=OK => success",
      },
    );
    const md = generateFailureReviewMarkdown(review);

    assert.ok(md.includes("## Log Signals"));
    assert.ok(md.includes("Backtrack warnings"));
    assert.ok(md.includes("tap_point_band_back"));
  });

  it("states when no failures were recorded", () => {
    const review = generateFailureReviewJson([], [], mockConfig, {
      partial: false,
      durationMs: 1000,
    });
    const md = generateFailureReviewMarkdown(review);

    assert.ok(md.includes("No failures were recorded"));
  });
});
