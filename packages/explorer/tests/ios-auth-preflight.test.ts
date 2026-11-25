import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkAuth } from "../src/auth-preflight.js";
import type { McpToolInterface } from "../src/types.js";

function createMockMcp(calls: Array<{ method: string; args?: unknown }>): McpToolInterface {
  const ok = <T>(data: T) =>
    Promise.resolve({
      status: "success" as const,
      reasonCode: "OK" as const,
      sessionId: "test-session",
      durationMs: 1,
      attempts: 1,
      artifacts: [],
      data,
      nextSuggestions: [],
    });

  return {
    launchApp: (args) => {
      calls.push({ method: "launchApp", args });
      return ok({} as any);
    },
    terminateApp: (args) => {
      calls.push({ method: "terminateApp", args });
      return ok({} as any);
    },
    waitForUiStable: (args) => {
      calls.push({ method: "waitForUiStable", args });
      return ok({} as any);
    },
    inspectUi: (args) => {
      calls.push({ method: "inspectUi", args });
      return ok({ content: {} } as any);
    },
    tapElement: () => ok({} as any),
    navigateBack: () => ok({} as any),
    takeScreenshot: () => ok({} as any),
    recoverToKnownState: () => ok({} as any),
    resetAppState: (args) => {
      calls.push({ method: "resetAppState", args });
      return ok({} as any);
    },
    requestManualHandoff: () => ok({} as any),
    getScreenSummary: () => ok({} as any),
    tap: () => ok({} as any),
    scrollOnly: () => ok({} as any),
  };
}

describe("checkAuth iOS safety", () => {
  it("terminates and launches without calling resetAppState (simctl uninstall) on iOS", async () => {
    const calls: Array<{ method: string; args?: unknown }> = [];
    const mcp = createMockMcp(calls);

    const result = await checkAuth(
      {
        auth: { type: "already-logged-in" },
        appId: "com.timeone.linknotes",
        platform: "ios-simulator",
        launchEnv: { LINKNOTES_UI_TESTING: "1" },
      },
      mcp,
    );

    assert.equal(result.success, true);
    assert.equal(calls.some((c) => c.method === "resetAppState"), false);
    assert.equal(calls[0]?.method, "terminateApp");
    assert.deepEqual(calls[1], {
      method: "launchApp",
      args: {
        appId: "com.timeone.linknotes",
        launchEnv: { LINKNOTES_UI_TESTING: "1" },
        terminateRunning: true,
      },
    });
  });

  it("retains resetAppState preflight before launch on Android", async () => {
    const calls: Array<{ method: string; args?: unknown }> = [];
    const mcp = createMockMcp(calls);

    const result = await checkAuth(
      {
        auth: { type: "already-logged-in" },
        appId: "com.example.demo",
        platform: "android-emulator",
      },
      mcp,
    );

    assert.equal(result.success, true);
    assert.equal(calls[0]?.method, "resetAppState");
    assert.equal(calls[1]?.method, "launchApp");
  });
});
