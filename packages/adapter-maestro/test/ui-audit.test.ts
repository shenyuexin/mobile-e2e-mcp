import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import type { InspectUiNode } from "@mobile-e2e-mcp/contracts";
import {
  buildUiAuditBaselineSurface,
  diffUiAuditAgainstBaseline,
  mergeUiAuditBaselineFile,
  normalizeDynamicTokens,
  parseUiAuditBaselineFile,
} from "../src/ui-audit-baseline.ts";
import { auditUiNodes, buildUiAuditNextSuggestions } from "../src/ui-audit-model.ts";
import { auditUiSurfaceWithMaestroTool } from "../src/ui-audit-tool.ts";

test("auditUiNodes detects small targets, edge clipping, sibling overlaps, duplicate IDs, missing IDs, raw i18n keys, and zero size with system exemptions", () => {
  const nodes: InspectUiNode[] = [
    { className: "Application", contentDesc: "Demo", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][400,800]" },
    // Small severe button without ID -> smallTargets (severe) + missingA11yId
    { className: "Button", contentDesc: "Close", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,40][50,70]" },
    // System keyboard key 'a' and Sheet Grabber should be exempt from smallTargets and missingA11yId
    { className: "Button", contentDesc: "a", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[60,700][92,740]" },
    { className: "Button", contentDesc: "Sheet Grabber", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[180,100][216,105]" },
    // Two overlapping sibling buttons with duplicate resourceId
    { className: "Button", resourceId: "dup.btn", contentDesc: "First", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,200][180,260]" },
    { className: "Button", resourceId: "dup.btn", contentDesc: "Second", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[40,210][180,260]" },
    // Ancestor Cell wrapping inner Button should NOT trigger siblingOverlaps, and Cell is exempt from edgeClipping
    { className: "Cell", resourceId: "row.1", contentDesc: "Row 1", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[0,300][430,360]" },
    { className: "Button", resourceId: "row.1.action", contentDesc: "Act", clickable: true, enabled: true, scrollable: false, depth: 2, bounds: "[320,308][370,352]" },
    // Edge clipped Button (half off right edge)
    { className: "Button", resourceId: "clipped.btn", contentDesc: "Clipped", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[380,400][430,450]" },
    // SF Symbol label should NOT trigger rawI18nKeys, while app i18n key SHOULD trigger it
    { className: "Image", contentDesc: "pencil.and.outline", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[20,480][44,504]" },
    { className: "StaticText", contentDesc: "reader.tool.color.red", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[60,480][200,504]" },
    // Zero size interactive element
    { className: "Button", resourceId: "zero.btn", contentDesc: "Ghost", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[10,550][10,580]" },
  ];

  const report = auditUiNodes(nodes, {
    platform: "ios",
    surfaceName: "settings",
    screenWidth: 400,
    screenHeight: 800,
  });

  assert.equal(report.surfaceName, "settings");
  assert.equal(report.edgeClipping.length, 1);
  assert.equal(report.edgeClipping[0]?.resourceId, "clipped.btn");
  assert.equal(report.smallTargets.length, 1);
  assert.equal(report.smallTargets[0]?.severity, "severe");
  assert.equal(report.siblingOverlaps.length, 1);
  assert.equal(report.missingA11yId.length, 1);
  assert.equal(report.missingA11yId[0]?.label, "Close");
  assert.equal(report.duplicateA11yIds.length, 1);
  assert.equal(report.duplicateA11yIds[0]?.resourceId, "dup.btn");
  assert.equal(report.rawI18nKeys.length, 1);
  assert.equal(report.rawI18nKeys[0]?.label, "reader.tool.color.red");
  assert.equal(report.zeroSize.length, 1);
  assert.equal(report.zeroSize[0]?.resourceId, "zero.btn");

  const suggestions = buildUiAuditNextSuggestions(report);
  assert.equal(suggestions.length >= 5, true);
});

test("auditUiNodes respects custom i18nKeyPrefixes even if prefix matches SF symbol pattern", () => {
  const nodes: InspectUiNode[] = [
    { className: "Application", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][400,800]" },
    { className: "StaticText", contentDesc: "folder.badge.title", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[20,40][200,70]" },
  ];

  const defaultReport = auditUiNodes(nodes, { platform: "ios" });
  assert.equal(defaultReport.rawI18nKeys.length, 0);

  const prefixedReport = auditUiNodes(nodes, {
    platform: "ios",
    i18nKeyPrefixes: ["folder."],
  });
  assert.equal(prefixedReport.rawI18nKeys.length, 1);
});

test("auditUiSurfaceWithMaestroTool evaluates offline nodes, dryRun, and live inspectUi mock", async () => {
  const offlineResult = await auditUiSurfaceWithMaestroTool({
    sessionId: "audit-offline",
    platform: "android",
    surfaceName: "login",
    nodes: [
      { className: "android.widget.FrameLayout", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][1080,2400]" },
      { className: "android.widget.Button", text: "Continue", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[100,200][140,240]" },
    ],
  });
  assert.equal(offlineResult.status, "success");
  assert.equal(offlineResult.data.smallTargets.length, 1);
  assert.equal(offlineResult.data.smallTargets[0]?.minRequiredPt, 48);

  const dryRunResult = await auditUiSurfaceWithMaestroTool({
    sessionId: "audit-dry",
    platform: "ios",
    dryRun: true,
  });
  assert.equal(dryRunResult.status, "success");
  assert.equal(dryRunResult.data.dryRun, true);
  assert.equal(dryRunResult.data.command[0], "axe");

  const mockedCaptureResult = await auditUiSurfaceWithMaestroTool(
    {
      sessionId: "audit-mock",
      platform: "ios",
      surfaceName: "mocked",
    },
    {
      inspectUi: async () => ({
        status: "success",
        reasonCode: "OK",
        sessionId: "audit-mock",
        durationMs: 10,
        attempts: 1,
        artifacts: ["output/evidence/ui-dumps/audit-mock/ios.json"],
        data: {
          dryRun: false,
          runnerProfile: "native_ios",
          outputPath: "output/evidence/ui-dumps/audit-mock/ios.json",
          command: ["axe", "describe-ui", "--udid", "SIM-1"],
          exitCode: 0,
          supportLevel: "full",
          content: JSON.stringify([
            { type: "Application", enabled: true, frame: { x: 0, y: 0, width: 390, height: 844 }, children: [
              { type: "Button", AXLabel: "settings.header.title", enabled: true, frame: { x: 20, y: 80, width: 120, height: 44 } },
            ] },
          ]),
        },
        nextSuggestions: [],
      }),
    },
  );
  assert.equal(mockedCaptureResult.status, "success");
  assert.equal(mockedCaptureResult.artifacts.length, 1);
  assert.equal(mockedCaptureResult.data.rawI18nKeys.length, 1);
  assert.equal(mockedCaptureResult.data.missingA11yId.length, 1);
});

test("auditUiNodes ignores iOS scroll bar Sliders and non-clickable document TextAreas while keeping app Sliders", () => {
  const nodes: InspectUiNode[] = [
    { className: "Application", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][1032,1376]" },
    // Non-clickable multi-page PDF TextArea extending beyond bottom edge behind toolbar button
    { className: "TextArea", contentDesc: "Document body", clickable: false, enabled: true, scrollable: true, depth: 1, bounds: "[311,128][1032,4930]" },
    { className: "Button", resourceId: "library.sidebar.row.more", contentDesc: "Folder actions", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[246,196][290,240]" },
    // UIKit scroll bar indicator Sliders overlapping nearby button
    { className: "Slider", contentDesc: "Vertical scroll bar, 1 page", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[261,196][291,408]" },
    { className: "Slider", contentDesc: "Horizontal scroll bar, 1 page", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[16,375][294,405]" },
    // Real interactive app Slider (should still be audited for touch target size)
    { className: "Slider", resourceId: "reader.brush.opacity", contentDesc: "Brush opacity", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[20,500][180,530]" },
  ];

  const report = auditUiNodes(nodes, {
    platform: "ios",
    surfaceName: "library_home",
    screenWidth: 1032,
    screenHeight: 1376,
  });

  assert.equal(report.edgeClipping.length, 0);
  assert.equal(report.siblingOverlaps.length, 0);
  assert.equal(report.missingA11yId.length, 0);
  assert.equal(report.smallTargets.length, 1);
  assert.equal(report.smallTargets[0]?.label, "Brush opacity");
});

test("UI audit baseline ratchet normalizes UUIDs, detects new regressions, tracks resolved issues, and validates corrupt baselines", async () => {
  assert.equal(
    normalizeDynamicTokens("reader.page.bookmark.67E4BD16-2179-4671-8899-AABBCCDDEEFF"),
    "reader.page.bookmark.<uuid>",
  );

  const baselineNodesRun1: InspectUiNode[] = [
    { className: "Application", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][1000,1000]" },
    { className: "Button", resourceId: "reader.page.bookmark.67E4BD16-2179-4671-8899-AABBCCDDEEFF", contentDesc: "Bookmark", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,20][44,44]" },
    { className: "Button", contentDesc: "Unlabeled old", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[80,20][130,64]" },
    { className: "StaticText", contentDesc: "library.old.rawKey", clickable: false, enabled: true, scrollable: false, depth: 1, bounds: "[20,100][200,130]" },
  ];

  // Run 2 has a freshly generated UUID in bookmark ID, resolves library.old.rawKey, and adds 1 new rawI18nKey.
  const nodesRun2WithRegression: InspectUiNode[] = [
    { className: "Application", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][1000,1000]" },
    { className: "Button", resourceId: "reader.page.bookmark.11112222-3333-4444-5555-666677778888", contentDesc: "Bookmark", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,20][44,44]" },
    { className: "Button", contentDesc: "Unlabeled old", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[80,20][130,64]" },
    { className: "Button", resourceId: "settings.new.btn", contentDesc: "settings.new.rawKey", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,160][200,204]" },
  ];

  const audit1 = auditUiNodes(baselineNodesRun1, { platform: "ios", surfaceName: "01_home", screenWidth: 1000, screenHeight: 1000, i18nKeyPrefixes: ["library.", "settings."] });
  const entry1 = buildUiAuditBaselineSurface(audit1);
  const file1 = mergeUiAuditBaselineFile(null, "01_home", entry1, "2026-11-25T00:00:00Z");

  // Same structural audit with a rotated UUID -> 0 regressions, 0 resolved
  const audit1RotatedUuid = auditUiNodes(
    baselineNodesRun1.map((n) =>
      n.resourceId?.includes("bookmark")
        ? { ...n, resourceId: "reader.page.bookmark.AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" }
        : n,
    ),
    { platform: "ios", surfaceName: "01_home", screenWidth: 1000, screenHeight: 1000, i18nKeyPrefixes: ["library.", "settings."] },
  );
  const diffRotated = diffUiAuditAgainstBaseline(audit1RotatedUuid, file1, {
    baselinePath: "tmp/baseline.json",
    mode: "compare",
  });
  assert.equal(diffRotated.newIssueCounts.total, 0);
  assert.equal(diffRotated.resolvedIssueCounts.total, 0);
  assert.equal(diffRotated.preExistingIssueCounts.total, entry1.counts.severeSmallTargets + entry1.counts.missingA11yId + entry1.counts.rawI18nKeys);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "m2e-audit-baseline-"));
  try {
    const baselinePath = path.join(tmpDir, "ipad.ui-audit.json");
    const updateRes = await auditUiSurfaceWithMaestroTool({
      sessionId: "baseline-test",
      platform: "ios",
      surfaceName: "01_home",
      screenWidth: 1000,
      screenHeight: 1000,
      i18nKeyPrefixes: ["library.", "settings."],
      baselinePath,
      baselineMode: "update",
      nodes: baselineNodesRun1,
    });
    assert.equal(updateRes.status, "success");
    assert.equal(updateRes.data.baselineDiff?.baselineUpdated, true);
    const written = parseUiAuditBaselineFile(await readFile(baselinePath, "utf8"));
    assert.ok(written?.surfaces["01_home"]);

    const compareRes = await auditUiSurfaceWithMaestroTool({
      sessionId: "baseline-test",
      platform: "ios",
      surfaceName: "01_home",
      screenWidth: 1000,
      screenHeight: 1000,
      i18nKeyPrefixes: ["library.", "settings."],
      baselinePath,
      baselineMode: "compare",
      nodes: nodesRun2WithRegression,
    });
    assert.equal(compareRes.status, "success");
    assert.equal(compareRes.data.baselineDiff?.matchedSurface, true);
    assert.equal(compareRes.data.baselineDiff?.newIssueCounts.rawI18nKeys, 1);
    assert.equal(compareRes.data.baselineDiff?.resolvedIssueCounts.rawI18nKeys, 1);
    assert.ok(compareRes.nextSuggestions.some((s) => s.includes("[ui-baseline] Detected +1 new regression")));

    await writeFile(baselinePath, "{corrupt json", "utf8");
    const badRes = await auditUiSurfaceWithMaestroTool({
      sessionId: "baseline-test",
      platform: "ios",
      surfaceName: "01_home",
      baselinePath,
      nodes: baselineNodesRun1,
    });
    assert.equal(badRes.status, "failed");
    assert.equal(badRes.reasonCode, "CONFIGURATION_ERROR");
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test("UI audit baseline normalizes dynamic timestamps, dates, times, and unlabeled numeric labels", () => {
  assert.equal(normalizeDynamicTokens("2026-11-26 07:25"), "<timestamp>");
  assert.equal(normalizeDynamicTokens("recent 07:24"), "recent <time>");
  assert.equal(normalizeDynamicTokens("2026-11-26"), "<date>");

  const makeStudyNodes = (ts: string, recentTimes: [string, string], days: string[]): InspectUiNode[] => [
    { className: "Application", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][1032,1376]" },
    { className: "StaticText", contentDesc: ts, clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,100][180,120]" },
    { className: "StaticText", contentDesc: `recent ${recentTimes[0]}`, clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,140][140,160]" },
    { className: "StaticText", contentDesc: `recent ${recentTimes[1]}`, clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[20,170][140,190]" },
    ...days.map((d, idx) => ({
      className: "Button",
      contentDesc: d,
      clickable: true,
      enabled: true,
      scrollable: false,
      depth: 1,
      bounds: `[${40 + idx * 50},300][${68 + idx * 50},328]`,
    })),
  ];

  const auditRun1 = auditUiNodes(
    makeStudyNodes("2026-11-25 21:32", ["21:32", "21:32"], ["22", "23", "24", "25", "26", "27", "28"]),
    { platform: "ios", surfaceName: "07_study_hub", screenWidth: 1032, screenHeight: 1376 },
  );
  const baselineFile = mergeUiAuditBaselineFile(
    null,
    "07_study_hub",
    buildUiAuditBaselineSurface(auditRun1),
    "2026-11-25T13:32:00Z",
  );

  // Run 2 across midnight & week rollover -> 0 regressions, 0 resolved
  const auditRun2SameCount = auditUiNodes(
    makeStudyNodes("2026-11-26 07:25", ["07:24", "07:25"], ["10", "11", "12", "13", "14", "15", "16"]),
    { platform: "ios", surfaceName: "07_study_hub", screenWidth: 1032, screenHeight: 1376 },
  );
  const cleanDiff = diffUiAuditAgainstBaseline(auditRun2SameCount, baselineFile, {
    baselinePath: "tmp/ipad.ui-audit.json",
    mode: "compare",
  });
  assert.equal(cleanDiff.newIssueCounts.total, 0);
  assert.equal(cleanDiff.resolvedIssueCounts.total, 0);

  // Genuine added unlabeled numeric button (7 -> 8) -> caught as +1 severeSmallTargets & +1 missingA11yId
  const auditRun3AddedBtn = auditUiNodes(
    makeStudyNodes("2026-11-26 07:25", ["07:24", "07:25"], ["10", "11", "12", "13", "14", "15", "16", "17"]),
    { platform: "ios", surfaceName: "07_study_hub", screenWidth: 1032, screenHeight: 1376 },
  );
  const regressedDiff = diffUiAuditAgainstBaseline(auditRun3AddedBtn, baselineFile, {
    baselinePath: "tmp/ipad.ui-audit.json",
    mode: "compare",
  });
  assert.equal(regressedDiff.newIssueCounts.severeSmallTargets, 1);
  assert.equal(regressedDiff.newIssueCounts.missingA11yId, 1);
});

test("auditUiNodes exempts zero-size UIKit scrollbar sliders labeled '0 pages' while keeping real Sliders", () => {
  const nodes: InspectUiNode[] = [
    { className: "Application", clickable: false, enabled: true, scrollable: false, depth: 0, bounds: "[0,0][400,800]" },
    { className: "Slider", contentDesc: "0 pages", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[0,0][0,0]" },
    { className: "Slider", contentDesc: "2 页", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[0,0][0,0]" },
    { className: "Slider", resourceId: "volume.slider", contentDesc: "Volume", clickable: true, enabled: true, scrollable: false, depth: 1, bounds: "[0,0][0,0]" },
  ];

  const report = auditUiNodes(nodes, {
    platform: "ios",
    surfaceName: "sync_banner",
    screenWidth: 400,
    screenHeight: 800,
  });

  assert.equal(report.zeroSize.length, 1);
  assert.equal(report.zeroSize[0]?.resourceId, "volume.slider");
});
