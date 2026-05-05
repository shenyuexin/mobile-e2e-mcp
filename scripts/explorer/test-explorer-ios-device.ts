/**
 * Explorer harness for iOS physical devices, including connected iPad Settings.
 *
 * Run:
 *   IOS_DEVICE_ID=<iPad-UDID> IOS_EXECUTION_BACKEND=wda \
 *     pnpm exec tsx scripts/explorer/test-explorer-ios-device.ts [smoke|full]
 *
 * Required setup:
 *   - iPad/iPhone connected over USB and trusted
 *   - WebDriverAgent running on the device
 *   - iproxy forwarding WDA: iproxy 8100 8100 --udid <iPad-UDID>
 */

import { execSync } from "node:child_process";
import { createWriteStream, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DeviceInfo, ToolResult } from "@mobile-e2e-mcp/contracts";
import { explore } from "../../packages/explorer/src/cli.js";
import { prepareRunArtifacts } from "../../packages/explorer/src/run-artifacts.js";
import { formatRunTimestamp } from "../../packages/explorer/src/report/summary.js";
import { createServer } from "../../packages/mcp-server/src/index.js";
import {
  buildIosDeviceExplorerCliArgs,
  parseIosDeviceExplorerScriptConfig,
  renderIosDeviceExplorerHelp,
} from "./test-explorer-ios-device-lib.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "../..");

function ensureBuild(): void {
  const adapterSrc = join(repoRoot, "packages/adapter-maestro/src/ios-backend-wda.ts");
  const adapterDist = join(repoRoot, "packages/adapter-maestro/dist/index.js");
  try {
    const srcStat = statSync(adapterSrc);
    const distStat = statSync(adapterDist);
    if (srcStat.mtimeMs > distStat.mtimeMs) {
      console.log("[EXPLORER-BUILD] adapter-maestro source is newer than dist — rebuilding...");
      execSync("pnpm build", { cwd: repoRoot, stdio: "inherit" });
      console.log("[EXPLORER-BUILD] rebuild complete.");
    }
  } catch (error) {
    console.log(`[EXPLORER-BUILD] dist not found or stale — rebuilding (${error instanceof Error ? error.message : String(error)})...`);
    execSync("pnpm build", { cwd: repoRoot, stdio: "inherit" });
    console.log("[EXPLORER-BUILD] rebuild complete.");
  }
}

function formatLogArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function teeLog(level: "LOG" | "ERROR" | "WARN" | "INFO", args: unknown[]): void {
  const line = args.map(formatLogArg).join(" ");
  logStream.write(`[${formatRunTimestamp(new Date())}] [${level}] ${line}\n`);
}

async function flushLogStream(): Promise<void> {
  await new Promise<void>((resolve) => {
    logStream.end(() => resolve());
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertWdaReady(): Promise<void> {
  const response = await fetch("http://localhost:8100/status", {
    method: "GET",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`WDA /status returned ${String(response.status)}. Run: iproxy 8100 8100 --udid ${config.deviceId}`);
  }
  console.log("[PREFLIGHT] WDA is reachable at http://localhost:8100/status");
}

async function assertDeviceListed(server: ReturnType<typeof createServer>): Promise<void> {
  const result = await server.invoke("list_devices", { includeUnavailable: true }) as ToolResult<{
    android: DeviceInfo[];
    ios: DeviceInfo[];
  }>;
  const device = result.data.ios.find((entry) => entry.id === config.deviceId);
  if (!device) {
    const knownIds = result.data.ios.map((entry) => `${entry.name ?? "iOS"}:${entry.id}:${entry.state}`).join(", ");
    throw new Error(`iOS device ${config.deviceId} was not detected by list_devices. Detected iOS devices: ${knownIds || "none"}`);
  }
  if (!device.available) {
    throw new Error(`iOS device ${config.deviceId} is listed but not available: state=${device.state}`);
  }
  console.log(`[PREFLIGHT] iOS device detected: ${device.name ?? config.deviceId} (${device.state})`);
}

function extractTextSamples(content: unknown): string[] {
  const values: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    for (const key of ["text", "accessibilityLabel", "label", "contentDesc", "AXLabel", "title"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        values.push(value.trim());
      }
    }
    const children = record.children;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };
  visit(content);
  return [...new Set(values)].slice(0, 20);
}

function looksLikeSettingsHome(samples: string[]): boolean {
  const joined = samples.join(" ").toLowerCase();
  const matchedSignals = [
    "wi-fi",
    "bluetooth",
    "general",
    "control center",
    "display",
    "wallpaper",
    "siri",
    "privacy",
  ].filter((signal) => joined.includes(signal));
  return matchedSignals.length >= 3;
}

async function runMcpUiProbe(server: ReturnType<typeof createServer>): Promise<void> {
  const probeSessionId = `ios-device-probe-${Date.now()}`;
  console.log("[PROBE] Launching Settings and collecting WDA-backed UI evidence...");

  const launchResult = await server.invoke("launch_app", {
    sessionId: `${probeSessionId}-launch`,
    platform: "ios",
    runnerProfile: "native_ios",
    deviceId: config.deviceId,
    appId: config.appId,
  });
  if (launchResult.status !== "success" && launchResult.status !== "partial") {
    throw new Error(`launch_app failed: ${launchResult.reasonCode}`);
  }
  await sleep(3000);

  await server.invoke("wait_for_ui_stable", {
    sessionId: `${probeSessionId}-stable`,
    platform: "ios",
    runnerProfile: "native_ios",
    deviceId: config.deviceId,
    timeoutMs: 10000,
    intervalMs: 500,
    consecutiveStable: 2,
  });

  const inspectResult = await server.invoke("inspect_ui", {
    sessionId: `${probeSessionId}-inspect`,
    platform: "ios",
    runnerProfile: "native_ios",
    deviceId: config.deviceId,
    appId: config.appId,
    outputPath: `artifacts/explorer/debug-inspect-${probeSessionId}.json`,
  }) as ToolResult<{ content?: unknown; summary?: { totalNodes?: number; clickableNodes?: number }; outputPath?: string }>;

  if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
    throw new Error(`inspect_ui failed: ${inspectResult.reasonCode}`);
  }

  const sampleTexts = extractTextSamples(inspectResult.data.content);
  console.log(
    `[PROBE] inspect_ui status=${inspectResult.status}, totalNodes=${inspectResult.data.summary?.totalNodes ?? "n/a"}, clickableNodes=${inspectResult.data.summary?.clickableNodes ?? "n/a"}`,
  );
  console.log(`[PROBE] sampleTexts=${JSON.stringify(sampleTexts.slice(0, 12))}`);

  if (!looksLikeSettingsHome(sampleTexts)) {
    throw new Error(
      `Settings home was not confidently detected from WDA hierarchy. `
      + `Unlock the iPad, keep Settings on its root page, then rerun. sampleTexts=${JSON.stringify(sampleTexts.slice(0, 12))}`,
    );
  }
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(renderIosDeviceExplorerHelp());
  process.exit(0);
}

const config = parseIosDeviceExplorerScriptConfig(argv);
process.env.M2E_DEVICE_ID = config.deviceId;
process.env.IOS_DEVICE_ID = config.deviceId;
if (!process.env.IOS_EXECUTION_BACKEND) {
  process.env.IOS_EXECUTION_BACKEND = "wda";
}

ensureBuild();

const { logPath } = prepareRunArtifacts(config.outputDir);
const logStream = createWriteStream(logPath, { flags: "a" });
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
};

console.log = (...args: unknown[]) => {
  teeLog("LOG", args);
  originalConsole.log(...args);
};
console.error = (...args: unknown[]) => {
  teeLog("ERROR", args);
  originalConsole.error(...args);
};
console.warn = (...args: unknown[]) => {
  teeLog("WARN", args);
  originalConsole.warn(...args);
};
console.info = (...args: unknown[]) => {
  teeLog("INFO", args);
  originalConsole.info(...args);
};

async function main(): Promise<void> {
  console.log("=== Explorer Test Harness: iOS Physical Device ===");
  console.log(`Target app: ${config.appId}`);
  console.log(`Device ID: ${config.deviceId}`);
  console.log(`Backend: ${process.env.IOS_EXECUTION_BACKEND}`);
  console.log(`Mode: ${config.mode} (${config.mode === "smoke" ? "shallow breadth" : "deep coverage"})\n`);

  const server = createServer();
  try {
    await assertWdaReady();
    await assertDeviceListed(server);
    await runMcpUiProbe(server);

    process.env.EXPLORER_SKIP_PREFLIGHT_LAUNCH = "1";
    await explore(buildIosDeviceExplorerCliArgs(config), server);

    const exitCode = process.exitCode ?? 0;
    if (exitCode === 0) {
      console.log(`\n${config.mode} mode complete. Reports in ${config.outputDir}/`);
    } else {
      console.error(`\n${config.mode} mode finished with failures (exitCode=${String(exitCode)}). Reports in ${config.outputDir}/`);
    }
    process.exit(exitCode);
  } finally {
    await server.dispose?.();
    await flushLogStream();
  }
}

main().catch((error) => {
  console.error("Explorer iOS physical-device test failed:", error);
  flushLogStream().finally(() => process.exit(1));
});
