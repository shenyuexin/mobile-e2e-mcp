import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolResult } from "@mobile-e2e-mcp/contracts";
import {
  computeOutsidePopoverTapPoints,
  createBacktracker,
  extractOverlayDismissButtonLabels,
  findClickableElements,
  inspectIosPresentationScope,
  resolveExplorerPlatformHooks,
} from "../src/index.js";
import type { ExplorerConfig, McpToolInterface, UiHierarchy } from "../src/types.js";

const iosConfig: ExplorerConfig = {
  mode: "smoke",
  auth: { type: "skip-auth" },
  failureStrategy: "retry-3",
  maxDepth: 5,
  maxPages: 50,
  timeoutMs: 35_000,
  compareWith: null,
  platform: "ios-simulator",
  destructiveActionPolicy: "skip",
  appId: "com.timeone.linknotes",
  reportDir: "./reports",
};

function node(overrides: Partial<UiHierarchy>): UiHierarchy {
  return {
    className: "Group",
    elementType: "Group",
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [],
    ...overrides,
  };
}

function buildSplitViewBackground(): UiHierarchy {
  return node({
    frame: { x: 0, y: 0, width: 1032, height: 1376 },
    children: [
      node({
        className: "Button",
        elementType: "Button",
        AXUniqueId: "studyHub.tab.library",
        resourceId: "studyHub.tab.library",
        accessibilityLabel: "Library",
        contentDesc: "Library",
        clickable: true,
        frame: { x: 18, y: 92, width: 85, height: 28 },
      }),
      node({
        className: "StaticText",
        elementType: "StaticText",
        text: "Library",
        accessibilityLabel: "Library",
        frame: { x: 48, y: 98, width: 45, height: 16 },
      }),
      node({
        className: "Button",
        elementType: "Button",
        AXUniqueId: "studyHub.tab.study",
        resourceId: "studyHub.tab.study",
        accessibilityLabel: "Study",
        contentDesc: "Study",
        clickable: true,
        frame: { x: 105, y: 92, width: 79, height: 28 },
      }),
      node({
        className: "Button",
        elementType: "Button",
        AXUniqueId: "library.settings.footer",
        resourceId: "library.settings.footer",
        accessibilityLabel: "Settings",
        contentDesc: "Settings",
        clickable: true,
        frame: { x: 0, y: 1312, width: 280, height: 44 },
      }),
    ],
  });
}

describe("iOS iPad SplitView & Popover presentation scope", () => {
  it("scopes clickables and title to foreground PopoverDismissRegion sibling, excluding sidebar bleed", () => {
    const tree = node({
      className: "Application",
      elementType: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [
        node({
          frame: { x: 0, y: 0, width: 1032, height: 1376 },
          children: [
            buildSplitViewBackground(),
            node({
              frame: { x: 0, y: 0, width: 1032, height: 1376 },
              children: [
                node({
                  AXUniqueId: "PopoverDismissRegion",
                  resourceId: "PopoverDismissRegion",
                  accessibilityLabel: "dismiss popup",
                  contentDesc: "dismiss popup",
                  clickable: true,
                  frame: { x: 0, y: 0, width: 1032, height: 1376 },
                }),
                node({
                  frame: { x: 112, y: 128, width: 320, height: 327 },
                  children: [
                    node({
                      className: "StaticText",
                      elementType: "StaticText",
                      AXUniqueId: "library.createManage.title",
                      text: "Add to Library",
                      accessibilityLabel: "Add to Library",
                    }),
                    node({
                      className: "Button",
                      elementType: "Button",
                      AXUniqueId: "library.createManage.close",
                      accessibilityLabel: "Close",
                      contentDesc: "Close",
                      clickable: true,
                    }),
                    node({
                      className: "Button",
                      elementType: "Button",
                      AXUniqueId: "library.createManage.newNote",
                      accessibilityLabel: "New Note",
                      contentDesc: "New Note",
                      clickable: true,
                    }),
                    node({
                      className: "Button",
                      elementType: "Button",
                      AXUniqueId: "library.createManage.newFolder",
                      accessibilityLabel: "New Folder",
                      contentDesc: "New Folder",
                      clickable: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const scope = inspectIosPresentationScope(tree);
    assert.equal(scope.isModalOverlay, true);
    assert.equal(scope.hasDismissBackdrop, true);
    assert.deepEqual(scope.overlayFrame, { x: 112, y: 128, width: 320, height: 327 });

    const clickables = findClickableElements(tree, iosConfig);
    assert.deepEqual(
      clickables.map((c) => c.label),
      ["New Note", "New Folder"],
    );

    const iosHooks = resolveExplorerPlatformHooks("ios-simulator");
    assert.equal(iosHooks.extractScreenTitle(tree), "Add to Library");
  });

  it("picks the frontmost modal-sized sheet when background SplitView also contains a PopoverDismissRegion", () => {
    const tree = node({
      className: "Application",
      elementType: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [
        node({
          frame: { x: 0, y: 0, width: 1032, height: 1376 },
          children: [
            // Background SplitView wrapper with a full-screen PopoverDismissRegion
            node({
              frame: { x: 0, y: 0, width: 1032, height: 1376 },
              children: [
                node({
                  AXUniqueId: "PopoverDismissRegion",
                  accessibilityLabel: "dismiss popup",
                  frame: { x: -1032, y: -1376, width: 3096, height: 4128 },
                }),
                buildSplitViewBackground(),
              ],
            }),
            // Frontmost Settings form sheet (modal-sized)
            node({
              frame: { x: 0, y: 0, width: 1032, height: 1376 },
              children: [
                node({
                  AXUniqueId: "PopoverDismissRegion",
                  accessibilityLabel: "dismiss popup",
                  frame: { x: -1032, y: -1376, width: 3096, height: 4128 },
                }),
                node({
                  frame: { x: 226, y: 358, width: 580, height: 650 },
                  children: [
                    node({
                      className: "Button",
                      elementType: "Button",
                      AXUniqueId: "settings.closeButton",
                      accessibilityLabel: "Close",
                      contentDesc: "Close",
                      clickable: true,
                    }),
                    node({
                      className: "StaticText",
                      elementType: "StaticText",
                      text: "Settings",
                      accessibilityLabel: "Settings",
                    }),
                    node({
                      className: "Button",
                      elementType: "Button",
                      AXUniqueId: "settings.handwriting.row",
                      accessibilityLabel: "Handwriting Languages",
                      contentDesc: "Handwriting Languages",
                      clickable: true,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const scope = inspectIosPresentationScope(tree);
    assert.equal(scope.isModalOverlay, true);
    assert.equal(scope.kind, "sheet");
    assert.deepEqual(scope.overlayFrame, { x: 226, y: 358, width: 580, height: 650 });

    const clickables = findClickableElements(tree, iosConfig);
    assert.deepEqual(
      clickables.map((c) => c.label),
      ["Handwriting Languages"],
    );

    const iosHooks = resolveExplorerPlatformHooks("ios-simulator");
    assert.equal(iosHooks.extractScreenTitle(tree), "Settings");
  });

  it("handles custom SwiftUI .popover overlays without PopoverDismissRegion and skips empty duplicates", () => {
    const tree = node({
      className: "Application",
      elementType: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [
        buildSplitViewBackground(),
        // Empty duplicate wrapper
        node({
          AXUniqueId: "whiteboardExport.popover",
          frame: { x: 186, y: 384, width: 660, height: 620 },
          children: [],
        }),
        // Populated popover
        node({
          AXUniqueId: "whiteboardExport.popover",
          frame: { x: 186, y: 384, width: 660, height: 620 },
          children: [
            node({
              className: "Button",
              elementType: "Button",
              accessibilityLabel: "Dismiss",
              contentDesc: "Dismiss",
              clickable: true,
            }),
            node({
              className: "StaticText",
              elementType: "StaticText",
              text: "Export PDF",
              accessibilityLabel: "Export PDF",
            }),
            node({
              className: "Button",
              elementType: "Button",
              AXUniqueId: "whiteboardExport.gridView",
              accessibilityLabel: "Grid view",
              contentDesc: "Grid view",
              clickable: true,
            }),
          ],
        }),
      ],
    });

    const scope = inspectIosPresentationScope(tree);
    assert.equal(scope.isModalOverlay, true);
    assert.equal(scope.hasDismissBackdrop, false);
    assert.deepEqual(extractOverlayDismissButtonLabels(scope.activeRoot), ["Dismiss"]);

    const clickables = findClickableElements(tree, iosConfig);
    assert.deepEqual(
      clickables.map((c) => c.label),
      ["Grid view"],
    );
    const iosHooks = resolveExplorerPlatformHooks("ios-simulator");
    assert.equal(iosHooks.extractScreenTitle(tree), "Export PDF");
  });

  it("extracts detail pane title on iPad SplitView without false-triggering modal scope", () => {
    const tree = node({
      className: "Application",
      elementType: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [
        buildSplitViewBackground(),
        node({
          className: "StaticText",
          elementType: "StaticText",
          AXUniqueId: "commandBar.documentTitle",
          text: "Lecture 04 Notes",
          accessibilityLabel: "Lecture 04 Notes",
          frame: { x: 420, y: 49, width: 180, height: 18 },
        }),
      ],
    });

    const scope = inspectIosPresentationScope(tree);
    assert.equal(scope.isModalOverlay, false);

    const iosHooks = resolveExplorerPlatformHooks("ios-simulator");
    assert.equal(iosHooks.extractScreenTitle(tree), "Lecture 04 Notes");
  });

  it("computes outside-popover dismiss tap coordinates strictly outside overlay frame", () => {
    const pts = computeOutsidePopoverTapPoints(
      { x: 112, y: 128, width: 320, height: 327 },
      { x: 0, y: 0, width: 1032, height: 1376 },
    );
    assert.ok(pts.length >= 2);
    for (const pt of pts) {
      const inside =
        pt.x >= 112 && pt.x <= 432 && pt.y >= 128 && pt.y <= 455;
      assert.equal(inside, false, `Point (${pt.x},${pt.y}) must be outside popover`);
      assert.ok(pt.x >= 24 && pt.x <= 1008);
      assert.ok(pt.y >= 80 && pt.y <= 1296);
    }
  });
});

describe("iOS backtrack popover dismissal", () => {
  it("dismisses custom popover via Dismiss button before point-band back", async () => {
    const exportPopoverTree = {
      type: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [
        {
          type: "Group",
          AXUniqueId: "whiteboardExport.popover",
          frame: { x: 186, y: 384, width: 660, height: 620 },
          children: [
            { type: "Button", AXLabel: "Dismiss", clickable: true },
            { type: "StaticText", AXLabel: "Export PDF" },
          ],
        },
      ],
    };
    const parentTree = {
      type: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [{ type: "StaticText", AXLabel: "Library" }],
    };

    let dismissed = false;
    const tappedLabels: string[] = [];
    const coordTaps: Array<{ x: number; y: number }> = [];
    const ok = (data: Record<string, unknown> = {}): ToolResult<any> => ({
      status: "success",
      reasonCode: "OK",
      sessionId: "s1",
      durationMs: 5,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: [],
    });

    const mcp: McpToolInterface = {
      launchApp: async () => ok(),
      waitForUiStable: async () => ok(),
      inspectUi: async () => ok({ content: dismissed ? parentTree : exportPopoverTree }),
      tapElement: async (sel) => {
        const lbl = sel.contentDesc ?? sel.text ?? "";
        tappedLabels.push(lbl);
        if (lbl === "Dismiss") {
          dismissed = true;
          return ok();
        }
        return { ...ok(), status: "failed", reasonCode: "NO_MATCH" };
      },
      navigateBack: async () => ({ ...ok(), status: "failed", reasonCode: "NO_MATCH" }),
      takeScreenshot: async () => ok(),
      recoverToKnownState: async () => ok(),
      resetAppState: async () => ok(),
      requestManualHandoff: async () => ok(),
      getScreenSummary: async () => ok({ screenSummary: { pageIdentity: { hasBackAffordance: false } } }),
      tap: async (pt) => {
        coordTaps.push(pt);
        return ok();
      },
    };

    const backtracker = createBacktracker(mcp, "ios-simulator", "com.timeone.linknotes");
    const recovered = await backtracker.navigateBack("Library");
    assert.equal(recovered, true);
    assert.ok(tappedLabels.includes("Dismiss"));
    assert.equal(coordTaps.length, 0, "should dismiss via Dismiss button without coordinate taps");
  });

  it("dismisses backdrop popover via outside-popover tap when no dismiss button exists", async () => {
    const backdropPopoverTree = {
      type: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [
        {
          type: "Group",
          frame: { x: 0, y: 0, width: 1032, height: 1376 },
          children: [
            { type: "Group", AXUniqueId: "PopoverDismissRegion", AXLabel: "dismiss popup", frame: { x: 0, y: 0, width: 1032, height: 1376 } },
            {
              type: "Group",
              frame: { x: 112, y: 128, width: 320, height: 327 },
              children: [
                { type: "StaticText", AXLabel: "Quick Actions" },
                { type: "Button", AXLabel: "New Note", clickable: true },
              ],
            },
          ],
        },
      ],
    };
    const parentTree = {
      type: "Application",
      frame: { x: 0, y: 0, width: 1032, height: 1376 },
      children: [{ type: "StaticText", AXLabel: "Library" }],
    };

    let dismissed = false;
    const coordTaps: Array<{ x: number; y: number }> = [];
    const ok = (data: Record<string, unknown> = {}): ToolResult<any> => ({
      status: "success",
      reasonCode: "OK",
      sessionId: "s1",
      durationMs: 5,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: [],
    });

    const mcp: McpToolInterface = {
      launchApp: async () => ok(),
      waitForUiStable: async () => ok(),
      inspectUi: async () => ok({ content: dismissed ? parentTree : backdropPopoverTree }),
      tapElement: async () => ({ ...ok(), status: "failed", reasonCode: "NO_MATCH" }),
      navigateBack: async () => ({ ...ok(), status: "failed", reasonCode: "NO_MATCH" }),
      takeScreenshot: async () => ok(),
      recoverToKnownState: async () => ok(),
      resetAppState: async () => ok(),
      requestManualHandoff: async () => ok(),
      getScreenSummary: async () => ok({ screenSummary: { pageIdentity: { hasBackAffordance: false } } }),
      tap: async (pt) => {
        coordTaps.push(pt);
        if (pt.x > 432 || pt.x < 112 || pt.y > 455 || pt.y < 128) {
          dismissed = true;
          return ok();
        }
        return ok();
      },
    };

    const backtracker = createBacktracker(mcp, "ios-simulator", "com.timeone.linknotes");
    const recovered = await backtracker.navigateBack("Library");
    assert.equal(recovered, true);
    assert.equal(coordTaps.length, 1);
    assert.ok(coordTaps[0].x > 432, `Expected tap outside popover right edge, got (${coordTaps[0].x},${coordTaps[0].y})`);
  });
});
