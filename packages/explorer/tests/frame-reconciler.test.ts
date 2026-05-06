import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reconcileStackToSnapshot } from "../src/frame-reconciler.js";
import type { Frame, PageSnapshot, UiHierarchy } from "../src/types.js";

function makeUiTree(appId = "Settings"): UiHierarchy {
  return {
    className: "Application",
    accessibilityLabel: appId,
    packageName: appId,
    clickable: false,
    enabled: true,
    scrollable: false,
    children: [],
  };
}

function makeSnapshot(title: string, screenId: string, appId = "Settings"): PageSnapshot {
  return {
    screenId,
    screenTitle: title,
    uiTree: makeUiTree(appId),
    clickableElements: [],
    screenshotPath: "",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: 0,
    loadTimeMs: 0,
    stabilityScore: 1,
    appId,
    isExternalApp: false,
  };
}

function makeScrollableRootFrame(): Frame {
  return {
    state: {
      screenId: "settings-root",
      screenTitle: "Settings",
    },
    depth: 0,
    path: [],
    elementIndex: 1,
    elements: [],
    appId: "Settings",
    isExternalApp: false,
    scrollState: {
      enabled: true,
      segmentIndex: 0,
      segments: [
        [
          {
            label: "General",
            selector: { resourceId: "com.apple.settings.general" },
            elementType: "Button",
          },
        ],
      ],
      seenKeys: new Set(["resourceId:com.apple.settings.general"]),
      pageFingerprint: "Settings::normal_page::Settings",
      maxSegments: 10,
      restoreAttempts: 0,
      maxRestoreAttempts: 3,
    },
  };
}

describe("reconcileStackToSnapshot", () => {
  it("preserves scrollState when reconciling back to the same root page", () => {
    const rootFrame = makeScrollableRootFrame();
    const originalScrollState = rootFrame.scrollState;
    const stack: Frame[] = [rootFrame];

    const resumed = reconcileStackToSnapshot(
      stack,
      makeSnapshot("Settings", "settings-root"),
      "Settings",
    );

    assert.equal(resumed, rootFrame);
    assert.equal(rootFrame.scrollState, originalScrollState);
    assert.equal(rootFrame.scrollState?.segments.length, 1);
  });
});
