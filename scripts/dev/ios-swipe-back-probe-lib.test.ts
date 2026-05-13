import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSwipeBackProbeMarkdown,
  extractPageSnapshot,
  parseCandidateList,
  summarizeSwipeBackProbe,
} from "./ios-swipe-back-probe-lib.ts";

test("extractPageSnapshot derives compact identity from screen summary payload", () => {
  const snapshot = extractPageSnapshot({
    data: {
      screenSummary: {
        title: "General",
        screenId: "general-settings",
        pageIdentity: {
          treeHash: "tree-123",
          visibleElementCount: 42,
          identityConfidence: 0.91,
        },
      },
    },
  });

  assert.deepEqual(snapshot, {
    title: "General",
    screenId: "general-settings",
    treeHash: "tree-123",
    visibleElementCount: 42,
    identityConfidence: 0.91,
  });
});

test("summarizeSwipeBackProbe reports observed transition from navigate_back evidence", () => {
  const summary = summarizeSwipeBackProbe({
    runId: "ios-swipe-back-probe-1",
    sessionId: "session-1",
    deviceId: "device-1",
    platform: "ios",
    runnerProfile: "native_ios",
    appId: "com.apple.Preferences",
    entryText: "General",
    preBack: {
      title: "General",
      screenId: "general-settings",
      treeHash: "before-hash",
    },
    postBack: {
      title: "Settings",
      screenId: "settings-root",
      treeHash: "after-hash",
    },
    navigateBack: {
      status: "success",
      reasonCode: "OK",
      data: {
        executedStrategy: "ios_edge_swipe",
        command: "__wda_http__ device-1 POST /wda/dragfromtoforduration",
        commandHistory: [
          "__wda_http__ device-1 POST /wda/dragfromtoforduration variant-1",
          "__wda_http__ device-1 POST /wda/dragfromtoforduration variant-2",
        ],
        stateChanged: true,
        preBackTreeHash: "before-hash",
        postBackTreeHash: "after-hash",
        pageTreeHashUnchanged: false,
      },
      nextSuggestions: ["Verify the expected iOS screen transition."],
    },
  });

  assert.equal(summary.verdict, "pass");
  assert.equal(summary.executedStrategy, "ios_edge_swipe");
  assert.equal(summary.commandHistory?.length, 2);
  assert.equal(summary.stateChanged, true);
  assert.equal(summary.preBack.treeHash, "before-hash");
  assert.equal(summary.postBack.treeHash, "after-hash");
});

test("buildSwipeBackProbeMarkdown renders command and before/after state", () => {
  const markdown = buildSwipeBackProbeMarkdown({
    runId: "ios-swipe-back-probe-1",
    sessionId: "session-1",
    deviceId: "device-1",
    platform: "ios",
    runnerProfile: "native_ios",
    appId: "com.apple.Preferences",
    entryText: "General",
    verdict: "pass",
    status: "success",
    reasonCode: "OK",
    executedStrategy: "ios_edge_swipe",
    command: "__wda_http__ device-1 POST /wda/dragfromtoforduration",
    commandHistory: [
      "__wda_http__ device-1 POST /wda/dragfromtoforduration variant-1",
      "__wda_http__ device-1 POST /wda/dragfromtoforduration variant-2",
    ],
    stateChanged: true,
    pageTreeHashUnchanged: false,
    preBack: {
      title: "General",
      screenId: "general-settings",
      treeHash: "before-hash",
    },
    postBack: {
      title: "Settings",
      screenId: "settings-root",
      treeHash: "after-hash",
    },
    nextSuggestions: ["Verify the expected iOS screen transition."],
  });

  assert.match(markdown, /# iOS Swipe Back Probe Report/);
  assert.match(markdown, /- Verdict: pass/);
  assert.match(markdown, /ios_edge_swipe/);
  assert.match(markdown, /Command History/);
  assert.match(markdown, /variant-2/);
  assert.match(markdown, /before-hash/);
  assert.match(markdown, /after-hash/);
});

test("parseCandidateList preserves defaults and deduplicates env aliases", () => {
  assert.deepEqual(
    parseCandidateList("About,关于本机", "About, VPN, 关于本机"),
    ["About", "关于本机", "VPN"],
  );
});
