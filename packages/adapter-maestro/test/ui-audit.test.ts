import assert from "node:assert/strict";
import test from "node:test";
import type { InspectUiNode } from "@mobile-e2e-mcp/contracts";
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
