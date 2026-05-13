import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createServer } from "../../packages/mcp-server/src/index.ts";
import {
  buildSwipeBackProbeMarkdown,
  extractPageSnapshot,
  parseCandidateList,
  summarizeSwipeBackProbe,
  type ToolResultLike,
} from "./ios-swipe-back-probe-lib.ts";

const platform = "ios" as const;
const appId = process.env.M2E_APP_ID ?? "com.apple.Preferences";
const runnerProfile = process.env.M2E_RUNNER_PROFILE ?? "native_ios";
const deviceId = process.env.M2E_SIMULATOR_UDID
  ?? process.env.IOS_SIMULATOR_UDID
  ?? process.env.M2E_DEVICE_ID
  ?? process.env.IOS_DEVICE_ID
  ?? process.env.M2E_IOS_DEVICE_ID
  ?? "ADA078B9-3C6B-4875-8B85-A7789F368816";
const entryText = process.env.M2E_IOS_SWIPE_BACK_ENTRY_TEXT ?? "General";
const entryCandidates = parseCandidateList(
  `${entryText},通用`,
  process.env.M2E_IOS_SWIPE_BACK_ENTRY_ALIASES,
);
const subpageMarkerCandidates = parseCandidateList(
  "About,关于本机",
  process.env.M2E_IOS_SWIPE_BACK_SUBPAGE_MARKERS,
);

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log([
    "Usage: M2E_SIMULATOR_UDID=<UDID> IOS_EXECUTION_BACKEND=axe pnpm exec tsx scripts/dev/ios-swipe-back-probe.ts",
    "",
    "Environment:",
    "  M2E_SIMULATOR_UDID or IOS_SIMULATOR_UDID      Target iOS simulator UDID",
    "  IOS_EXECUTION_BACKEND=axe                     Recommended backend for simulator UI swipe",
    "  M2E_IOS_SWIPE_BACK_ENTRY_TEXT=General         Settings entry to open before swiping back",
    "  M2E_IOS_SWIPE_BACK_ENTRY_ALIASES=通用         Comma-separated fallback entry labels",
    "  M2E_IOS_SWIPE_BACK_SUBPAGE_MARKERS=About,关于本机  Comma-separated labels that prove the subpage opened",
    "  M2E_SESSION_ID=<id>                           Optional fixed session id",
    "",
    "Physical-device override:",
    "  IOS_DEVICE_ID=<UDID> IOS_EXECUTION_BACKEND=wda pnpm exec tsx scripts/dev/ios-swipe-back-probe.ts",
  ].join("\n"));
  process.exit(0);
}

function runIdFromDate(date: Date): string {
  return `ios-swipe-back-probe-${date.toISOString().replace(/[:.]/g, "-")}`;
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatResult(result: ToolResultLike): string {
  return `${result.status}${result.reasonCode ? ` (${result.reasonCode})` : ""}`;
}

function requireSuccess(result: ToolResultLike, label: string): void {
  if (result.status !== "success") {
    throw new Error(`${label} failed: ${formatResult(result)}`);
  }
}

async function runIosSwipeBackProbe(): Promise<number> {
  const server = await createServer();
  const runId = process.env.M2E_RUN_ID ?? runIdFromDate(new Date());
  const sessionId = process.env.M2E_SESSION_ID ?? runId;
  const artifactsDir = join("output", "evidence", "probes", "ios-swipe-back", runId);
  const reportsDir = "output/reports";

  await mkdir(artifactsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const invoke = async (toolName: string, input: Record<string, unknown>): Promise<ToolResultLike> => {
    console.log(`[ios-swipe-back-probe] → ${toolName}`);
    const result = await server.invoke(toolName as never, input as never) as ToolResultLike;
    console.log(`[ios-swipe-back-probe] ← ${toolName}: ${formatResult(result)}`);
    return result;
  };

  const waitForAnyEntry = async (): Promise<string> => {
    let last: ToolResultLike | undefined;
    for (const text of entryCandidates) {
      const result = await invoke("wait_for_ui", {
        sessionId,
        platform,
        runnerProfile,
        deviceId,
        appId,
        text,
        timeoutMs: 6000,
        intervalMs: 500,
        waitUntil: "visible",
      });
      last = result;
      if (result.status === "success" || result.status === "partial") return text;
    }
    throw new Error(`entry not visible: tried ${entryCandidates.join(", ")}; last=${last ? formatResult(last) : "none"}`);
  };

  const waitForSubpageMarker = async (): Promise<string> => {
    let last: ToolResultLike | undefined;
    for (const text of subpageMarkerCandidates) {
      const result = await invoke("wait_for_ui", {
        sessionId,
        platform,
        runnerProfile,
        deviceId,
        appId,
        text,
        timeoutMs: 7000,
        intervalMs: 500,
        waitUntil: "visible",
      });
      last = result;
      if (result.status === "success" || result.status === "partial") return text;
    }
    throw new Error(`subpage marker not visible after tapping entry: tried ${subpageMarkerCandidates.join(", ")}; last=${last ? formatResult(last) : "none"}`);
  };

  const tapEntry = async (text: string): Promise<void> => {
    const result = await invoke("tap_element", {
      sessionId,
      platform,
      runnerProfile,
      deviceId,
      appId,
      text,
      limit: 1,
    });
    if (result.status !== "success") {
      throw new Error(`tap entry failed for "${text}": ${formatResult(result)}`);
    }
  };

  try {
    console.log("[ios-swipe-back-probe] iOS Settings edge-swipe probe");
    console.log(`[ios-swipe-back-probe] device=${deviceId}`);
    console.log(`[ios-swipe-back-probe] backend=${process.env.IOS_EXECUTION_BACKEND ?? "<auto>"}`);
    console.log(`[ios-swipe-back-probe] runDir=${artifactsDir}`);

    await invoke("start_session", {
      sessionId,
      platform,
      profile: runnerProfile,
      deviceId,
      appId,
    });

    await invoke("terminate_app", {
      sessionId,
      platform,
      runnerProfile,
      deviceId,
      appId,
    });
    await settle(700);

    const launchResult = await invoke("launch_app", {
      sessionId,
      platform,
      runnerProfile,
      deviceId,
      appId,
    });
    requireSuccess(launchResult, "launch_app");
    await settle(2500);

    const resolvedEntryText = await waitForAnyEntry();
    await tapEntry(resolvedEntryText);
    await settle(2500);
    const subpageMarker = await waitForSubpageMarker();
    console.log(`[ios-swipe-back-probe] subpageMarker=${subpageMarker}`);

    const preBackResult = await invoke("get_screen_summary", {
      sessionId,
      platform,
      runnerProfile,
      deviceId,
      appId,
    });
    const preBack = extractPageSnapshot(preBackResult);

    const navigateBack = await invoke("navigate_back", {
      sessionId,
      platform,
      runnerProfile,
      deviceId,
      appId,
      target: "app",
      iosStrategy: "edge_swipe",
      postBackWaitForStable: true,
      verificationTimeoutMs: 6000,
    });
    await settle(1500);

    const postBackResult = await invoke("get_screen_summary", {
      sessionId,
      platform,
      runnerProfile,
      deviceId,
      appId,
    });
    const postBack = extractPageSnapshot(postBackResult);

    const summary = summarizeSwipeBackProbe({
      runId,
      sessionId,
      deviceId,
      platform,
      runnerProfile,
      appId,
      entryText: resolvedEntryText,
      preBack,
      postBack,
      navigateBack,
    });
    const markdown = buildSwipeBackProbeMarkdown(summary);

    const jsonPath = join(artifactsDir, "summary.json");
    const mdPath = join(artifactsDir, "report.md");
    await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await writeFile(mdPath, markdown, "utf8");
    await writeFile(join(reportsDir, "ios-swipe-back-probe.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await writeFile(join(reportsDir, "ios-swipe-back-probe.md"), markdown, "utf8");

    console.log(`[ios-swipe-back-probe] verdict=${summary.verdict}`);
    console.log(`[ios-swipe-back-probe] executedStrategy=${summary.executedStrategy ?? "-"}`);
    console.log(`[ios-swipe-back-probe] stateChanged=${summary.stateChanged ?? "-"}`);
    console.log(`[ios-swipe-back-probe] report=${mdPath}`);
    return summary.verdict === "pass" ? 0 : 1;
  } finally {
    await server.dispose?.();
  }
}

runIosSwipeBackProbe()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[ios-swipe-back-probe] failed: ${message}`);
    process.exitCode = 1;
  });
