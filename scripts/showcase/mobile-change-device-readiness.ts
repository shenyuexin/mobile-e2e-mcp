import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "../../packages/mcp-server/src/index.ts";
import type { ToolInvoker } from "./mobile-change-verification.ts";

export type DeviceReadinessVerdict = "ready_for_live_mobile_change_verification" | "blocked_before_live_verification";
export type DeviceReadinessReasonCode =
  | "OK"
  | "DEVICE_UNAVAILABLE"
  | "DEVICE_UNAUTHORIZED"
  | "DEVICE_OFFLINE"
  | "REQUESTED_DEVICE_UNAVAILABLE"
  | "PLATFORM_TOOL_UNAVAILABLE"
  | "APP_ARTIFACT_UNAVAILABLE"
  | "READINESS_CONTRACT_MISSING";

export type DeviceReadinessBlockerType =
  | "no_device"
  | "unauthorized"
  | "offline"
  | "wrong_device"
  | "platform_tool_unavailable"
  | "missing_app"
  | "missing_readiness_contract";

export interface MobileChangeDeviceReadinessOptions {
  runId: string;
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  policyProfile: string;
  runnerProfile: string;
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  deviceId?: string;
}

export interface DeviceReadinessCheck {
  id: "device-inventory" | "app-artifact" | "readiness-contract";
  status: "passed" | "blocked";
  reasonCode: DeviceReadinessReasonCode;
  detail: string;
  diagnostic?: {
    blockerType: DeviceReadinessBlockerType;
    evidence: string[];
    nextActions: string[];
  };
}

export interface MobileChangeDeviceReadinessPreflight {
  schema: "mobile-change-device-readiness/v1";
  runId: string;
  verdict: DeviceReadinessVerdict;
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  policyProfile: string;
  runnerProfile: string;
  selectedDeviceId?: string;
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  checks: DeviceReadinessCheck[];
  blockers: DeviceReadinessCheck[];
  nextAction: {
    kind:
      | "run_live_mobile_change_verification"
      | "connect_device_or_use_self_hosted_runner"
      | "authorize_device"
      | "restart_or_select_online_device"
      | "select_requested_device"
      | "install_or_repair_platform_tooling"
      | "build_or_provide_app_artifact"
      | "define_readiness_contract";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

const evidenceDir = "docs/showcase/evidence/mobile-change-device-readiness";
const summaryPath = `${evidenceDir}/summary.json`;
const reportPath = `${evidenceDir}/report.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function platformLabel(platform: "android" | "ios"): string {
  return platform === "android" ? "Android" : "iOS";
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].length > 0) return record[key];
  }
  return undefined;
}

function isUnauthorizedDevice(device: Record<string, unknown>): boolean {
  const state = stringField(device, "state", "status", "authorization", "authState")?.toLowerCase();
  return device.authorized === false || state === "unauthorized" || state === "unauthorised";
}

function isOfflineDevice(device: Record<string, unknown>): boolean {
  const state = stringField(device, "state", "status")?.toLowerCase();
  return state === "offline" || state === "disconnected";
}

function isReadyDevice(device: Record<string, unknown>): boolean {
  return Boolean(stringField(device, "id", "udid")) && device.available !== false && !isUnauthorizedDevice(device) && !isOfflineDevice(device);
}

function diagnosticCheck(params: {
  reasonCode: DeviceReadinessReasonCode;
  blockerType: DeviceReadinessBlockerType;
  detail: string;
  evidence: string[];
  nextActions: string[];
}): DeviceReadinessCheck {
  return {
    id: "device-inventory",
    status: "blocked",
    reasonCode: params.reasonCode,
    detail: params.detail,
    diagnostic: {
      blockerType: params.blockerType,
      evidence: params.evidence,
      nextActions: params.nextActions,
    },
  };
}

function deviceInventoryCheck(listDevicesResult: unknown, platform: "android" | "ios", requestedDeviceId?: string): {
  selectedDeviceId?: string;
  check: DeviceReadinessCheck;
} {
  const result = asRecord(listDevicesResult);
  if (result.status && result.status !== "success") {
    const reason = typeof result.reasonCode === "string" ? result.reasonCode : "unknown";
    return {
      check: diagnosticCheck({
        reasonCode: "PLATFORM_TOOL_UNAVAILABLE",
        blockerType: "platform_tool_unavailable",
        detail: `Device inventory failed before selecting a ${platform} device.`,
        evidence: [`list_devices status: ${String(result.status)}`, `reasonCode: ${reason}`],
        nextActions: ["Install or repair platform tooling, then rerun the readiness doctor."],
      }),
    };
  }
  const data = asRecord(asRecord(listDevicesResult).data);
  const devices = Array.isArray(data[platform]) ? data[platform] : [];
  const deviceRecords = devices.map((item) => asRecord(item));

  if (requestedDeviceId) {
    const requested = deviceRecords.find((device) => stringField(device, "id", "udid") === requestedDeviceId);
    if (!requested) {
      return {
        check: diagnosticCheck({
          reasonCode: "REQUESTED_DEVICE_UNAVAILABLE",
          blockerType: "wrong_device",
          detail: `Requested ${platform} device was not returned by list_devices: ${requestedDeviceId}.`,
          evidence: [
            `requestedDeviceId: ${requestedDeviceId}`,
            `seenDevices: ${deviceRecords.map((device) => stringField(device, "id", "udid") ?? "unknown").join(",") || "none"}`,
          ],
          nextActions: ["Connect the requested device, clear M2E_DEVICE_ID, or choose one of the listed device ids."],
        }),
      };
    }
    if (isReadyDevice(requested)) {
      return {
        selectedDeviceId: requestedDeviceId,
        check: {
          id: "device-inventory",
          status: "passed",
          reasonCode: "OK",
          detail: `Selected ${platform} device ${requestedDeviceId}.`,
        },
      };
    }
  }

  const readyDevice = deviceRecords.find((device) => isReadyDevice(device));
  if (readyDevice) {
    const selectedDeviceId = stringField(readyDevice, "id", "udid");
    return {
      selectedDeviceId,
      check: {
        id: "device-inventory",
        status: "passed",
        reasonCode: "OK",
        detail: `Selected ${platform} device ${selectedDeviceId}.`,
      },
    };
  }

  if (deviceRecords.length === 0) {
    const label = platformLabel(platform);
    return {
      check: diagnosticCheck({
        reasonCode: "DEVICE_UNAVAILABLE",
        blockerType: "no_device",
        detail: `No ${label} devices were returned by list_devices.`,
        evidence: [`${label} inventory is empty.`],
        nextActions: [`Connect an ${label} device or run on a self-hosted device runner.`],
      }),
    };
  }

  const firstUnauthorized = deviceRecords.find((device) => isUnauthorizedDevice(device));
  if (firstUnauthorized) {
    const deviceId = stringField(firstUnauthorized, "id", "udid") ?? "unknown";
    return {
      check: diagnosticCheck({
        reasonCode: "DEVICE_UNAUTHORIZED",
        blockerType: "unauthorized",
        detail: `${platform} device ${deviceId} is connected but not authorized for automation.`,
        evidence: [`deviceId: ${deviceId}`, `state: ${stringField(firstUnauthorized, "state", "status", "authorization", "authState") ?? "unauthorized"}`],
        nextActions: ["Accept the USB debugging authorization prompt, reconnect the device, then rerun verification."],
      }),
    };
  }

  const firstOffline = deviceRecords.find((device) => isOfflineDevice(device) || device.available === false);
  if (firstOffline) {
    const deviceId = stringField(firstOffline, "id", "udid") ?? "unknown";
    return {
      check: diagnosticCheck({
        reasonCode: "DEVICE_OFFLINE",
        blockerType: "offline",
        detail: `${platform} device ${deviceId} is listed but offline or unavailable.`,
        evidence: [`deviceId: ${deviceId}`, `state: ${stringField(firstOffline, "state", "status") ?? "unavailable"}`, `available: ${String(firstOffline.available)}`],
        nextActions: ["Reconnect the device, restart the platform bridge if needed, or select an online device."],
      }),
    };
  }

  return {
    check: diagnosticCheck({
      reasonCode: "DEVICE_UNAVAILABLE",
      blockerType: "no_device",
      detail: `No eligible ${platformLabel(platform)} device was returned by list_devices.`,
      evidence: [`deviceCount: ${deviceRecords.length}`],
      nextActions: [`Connect an eligible ${platformLabel(platform)} device or use a self-hosted runner.`],
    }),
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hasReadinessContract(expected: MobileChangeDeviceReadinessOptions["expectedReadiness"]): boolean {
  return Boolean(expected.screenId || expected.appPhase);
}

function nextActionForBlockers(blockers: DeviceReadinessCheck[]): MobileChangeDeviceReadinessPreflight["nextAction"] {
  const first = blockers[0];
  if (!first) {
    return {
      kind: "run_live_mobile_change_verification",
      command: "pnpm run proof:mobile-change-verification:live",
      reason: "A device and deterministic readiness contract are available, so the live proof runner can be attempted.",
    };
  }
  if (first.reasonCode === "DEVICE_UNAUTHORIZED") {
    return {
      kind: "authorize_device",
      command: "adb devices -l",
      reason: "The selected Android device needs USB debugging authorization before live verification can run.",
    };
  }
  if (first.reasonCode === "DEVICE_OFFLINE") {
    return {
      kind: "restart_or_select_online_device",
      command: "adb devices -l",
      reason: "The device is offline or unavailable; reconnect it, restart the platform bridge if needed, or select an online device.",
    };
  }
  if (first.reasonCode === "REQUESTED_DEVICE_UNAVAILABLE") {
    return {
      kind: "select_requested_device",
      command: "M2E_DEVICE_ID=<visible-device-id> pnpm run verify:mobile-change -- --live",
      reason: "The requested device id was not present; connect it or choose a visible device id.",
    };
  }
  if (first.reasonCode === "PLATFORM_TOOL_UNAVAILABLE") {
    return {
      kind: "install_or_repair_platform_tooling",
      command: "pnpm run verify:mobile-change -- --live",
      reason: "The platform inventory command failed; install or repair platform tooling, then retry verification.",
    };
  }
  if (first.reasonCode === "APP_ARTIFACT_UNAVAILABLE") {
    return {
      kind: "build_or_provide_app_artifact",
      command: "M2E_LIVE_MOBILE_CHANGE_APP_ARTIFACT=<apk-or-app-path> pnpm run proof:mobile-change-verification:live",
      reason: "The configured app artifact path is missing; build the app or point the live proof runner at an existing artifact.",
    };
  }
  if (first.reasonCode === "READINESS_CONTRACT_MISSING") {
    return {
      kind: "define_readiness_contract",
      command: "M2E_LIVE_MOBILE_CHANGE_EXPECTED_APP_PHASE=<phase> pnpm run proof:mobile-change-verification:live",
      reason: "At least one deterministic readiness expectation is required before claiming live app verification.",
    };
  }
  return {
    kind: "connect_device_or_use_self_hosted_runner",
    command: "M2E_LIVE_MOBILE_CHANGE_ALLOW_NO_DEVICE=1 pnpm run proof:mobile-change-verification:live",
    reason: "No eligible local device was discovered; connect one or run the live proof on a self-hosted device runner.",
  };
}

export async function buildMobileChangeDeviceReadinessPreflight(
  options: MobileChangeDeviceReadinessOptions,
  invoke: ToolInvoker,
): Promise<MobileChangeDeviceReadinessPreflight> {
  const checks: DeviceReadinessCheck[] = [];

  const listed = await invoke("list_devices", { includeUnavailable: true });
  const inventory = deviceInventoryCheck(listed, options.platform, options.deviceId);
  const selectedDeviceId = inventory.selectedDeviceId;
  checks.push(inventory.check);

  if (options.appArtifact) {
    const exists = await pathExists(path.resolve(repoRoot(), options.appArtifact));
    checks.push(exists
      ? {
          id: "app-artifact",
          status: "passed",
          reasonCode: "OK",
          detail: `Found app artifact at ${options.appArtifact}.`,
        }
      : {
          id: "app-artifact",
          status: "blocked",
          reasonCode: "APP_ARTIFACT_UNAVAILABLE",
          detail: `App artifact does not exist: ${options.appArtifact}.`,
          diagnostic: {
            blockerType: "missing_app",
            evidence: [`appArtifact: ${options.appArtifact}`],
            nextActions: ["Build the app artifact or point M2E_LIVE_MOBILE_CHANGE_APP_ARTIFACT at an existing file."],
          },
        });
  }

  checks.push(hasReadinessContract(options.expectedReadiness)
    ? {
        id: "readiness-contract",
        status: "passed",
        reasonCode: "OK",
        detail: "At least one deterministic readiness expectation is configured.",
      }
    : {
        id: "readiness-contract",
        status: "blocked",
        reasonCode: "READINESS_CONTRACT_MISSING",
        detail: "Expected screen id or app phase is required before live proof can be trusted.",
        diagnostic: {
          blockerType: "missing_readiness_contract",
          evidence: ["expectedReadiness.screenId and expectedReadiness.appPhase are both empty."],
          nextActions: ["Define M2E_LIVE_MOBILE_CHANGE_EXPECTED_SCREEN_ID or M2E_LIVE_MOBILE_CHANGE_EXPECTED_APP_PHASE before live verification."],
        },
      });

  const blockers = checks.filter((check) => check.status === "blocked");
  return {
    schema: "mobile-change-device-readiness/v1",
    runId: options.runId,
    verdict: blockers.length === 0 ? "ready_for_live_mobile_change_verification" : "blocked_before_live_verification",
    platform: options.platform,
    appId: options.appId,
    appArtifact: options.appArtifact,
    policyProfile: options.policyProfile,
    runnerProfile: options.runnerProfile,
    selectedDeviceId,
    expectedReadiness: options.expectedReadiness,
    checks,
    blockers,
    nextAction: nextActionForBlockers(blockers),
    boundaries: [
      "This preflight only proves local readiness to attempt live verification; it does not claim physical-device proof by itself.",
      "Device availability, app artifact presence, and readiness contracts are checked before invoking UI-affecting actions.",
      "Cloud farms and broad platform parity remain outside this preflight unless backed by separate evidence.",
    ],
  };
}

export function renderMobileChangeDeviceReadinessMarkdown(preflight: MobileChangeDeviceReadinessPreflight): string {
  const checkLines = preflight.checks.map((check) => {
    const diagnostic = check.diagnostic ? `; diagnostic \`${check.diagnostic.blockerType}\`` : "";
    return `- ${check.id}: \`${check.status}\` (${check.reasonCode}) - ${check.detail}${diagnostic}`;
  });
  const blockerLines = preflight.blockers.length > 0
    ? preflight.blockers.map((check) => `- ${check.id}: \`${check.reasonCode}\` (${check.diagnostic?.blockerType ?? "unknown"})`)
    : ["- none"];
  const diagnosticLines = preflight.blockers.flatMap((check) => check.diagnostic
    ? [
        `- ${check.diagnostic.blockerType}:`,
        `  - Evidence: ${check.diagnostic.evidence.join("; ")}`,
        `  - Next: ${check.diagnostic.nextActions.join("; ")}`,
      ]
    : []);
  const boundaryLines = preflight.boundaries.map((boundary) => `- ${boundary}`);

  return [
    "## Mobile change device readiness",
    "",
    `Verdict: \`${preflight.verdict}\``,
    `Platform: \`${preflight.platform}\``,
    `App: \`${preflight.appId}\``,
    `Policy profile: \`${preflight.policyProfile}\``,
    `Runner profile: \`${preflight.runnerProfile}\``,
    `Selected device: \`${preflight.selectedDeviceId ?? "none"}\``,
    "",
    "Expected readiness:",
    `- Screen: \`${preflight.expectedReadiness.screenId ?? "not-specified"}\``,
    `- App phase: \`${preflight.expectedReadiness.appPhase ?? "not-specified"}\``,
    "",
    "Checks:",
    ...checkLines,
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Diagnostics:",
    ...(diagnosticLines.length > 0 ? diagnosticLines : ["- none"]),
    "",
    "Next action:",
    `- \`${preflight.nextAction.kind}\`: ${preflight.nextAction.reason}`,
    `- Command: \`${preflight.nextAction.command}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    const existing = await readFile(absolutePath, "utf8");
    assert.equal(existing, content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-device-readiness`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeMobileChangeDeviceReadinessPreflight(check: boolean): Promise<MobileChangeDeviceReadinessPreflight> {
  const server = createServer();
  const invoke: ToolInvoker = process.env.M2E_DEVICE_READINESS_FORCE_NO_DEVICE === "1"
    ? async (toolName) => toolName === "list_devices"
      ? { status: "success", reasonCode: "OK", data: { android: [], ios: [] } }
      : { status: "skipped", reasonCode: "FORCED_NO_DEVICE" }
    : (toolName, input) => server.invoke(toolName, input);

  const preflight = await buildMobileChangeDeviceReadinessPreflight({
    runId: process.env.M2E_DEVICE_READINESS_RUN_ID ?? "mobile-change-device-readiness-2026-05-27",
    platform: (process.env.M2E_LIVE_MOBILE_CHANGE_PLATFORM as "android" | "ios" | undefined) ?? "android",
    appId: process.env.M2E_LIVE_MOBILE_CHANGE_APP_ID ?? "com.example.mobilechange",
    appArtifact: process.env.M2E_LIVE_MOBILE_CHANGE_APP_ARTIFACT,
    policyProfile: process.env.M2E_LIVE_MOBILE_CHANGE_POLICY_PROFILE ?? "interactive",
    runnerProfile: process.env.M2E_LIVE_MOBILE_CHANGE_RUNNER_PROFILE ?? "native_android",
    expectedReadiness: {
      screenId: process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_SCREEN_ID,
      appPhase: process.env.M2E_LIVE_MOBILE_CHANGE_EXPECTED_APP_PHASE ?? "authentication",
    },
    deviceId: process.env.M2E_DEVICE_ID,
  }, invoke);

  await writeOrCheck(summaryPath, `${JSON.stringify(preflight, null, 2)}\n`, check);
  await writeOrCheck(reportPath, renderMobileChangeDeviceReadinessMarkdown(preflight), check);
  return preflight;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const preflight = await writeMobileChangeDeviceReadinessPreflight(check);
  console.log(check
    ? "Mobile change device readiness preflight is up to date."
    : `Mobile change device readiness preflight written to ${evidenceDir}`);
  console.log(JSON.stringify({
    verdict: preflight.verdict,
    selectedDeviceId: preflight.selectedDeviceId ?? null,
    blockers: preflight.blockers.map((blocker) => blocker.reasonCode),
    nextAction: preflight.nextAction.kind,
  }, null, 2));
  if (preflight.verdict !== "ready_for_live_mobile_change_verification" && process.env.M2E_DEVICE_READINESS_ALLOW_BLOCKED !== "1") {
    process.exitCode = 1;
  }
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
