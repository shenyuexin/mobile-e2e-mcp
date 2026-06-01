import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "../../packages/mcp-server/src/index.ts";
import { listJsDebugTargetsWithMaestro } from "../../packages/adapter-maestro/src/js-debug.ts";
import {
  defaultReactNativeRuntimeContract,
  findReactNativeRuntimeMode,
  type ReactNativeRuntimeMode,
  type ReactNativeRuntimeModeContractEntry,
} from "./react-native-runtime-contract.ts";

export type ReactNativeReadinessVerdict = "ready_for_react_native_verification" | "blocked_before_react_native_verification";
export type ReactNativeReadinessProofLevel = "readiness_candidate" | "blocked_before_live";
export type ReactNativeReadinessReasonCode =
  | "OK"
  | "RUNTIME_MODE_CONTRACT_MISSING"
  | "APP_ARTIFACT_REQUIRED"
  | "DEVICE_UNAVAILABLE"
  | "DEVICE_UNAUTHORIZED"
  | "DEVICE_OFFLINE"
  | "REQUESTED_DEVICE_UNAVAILABLE"
  | "METRO_UNAVAILABLE"
  | "NO_JS_DEBUG_TARGET"
  | "READINESS_CONTRACT_MISSING"
  | "STABLE_SELECTOR_CONTRACT_MISSING";

export interface ReactNativeReadinessOptions {
  runId: string;
  platform: "android" | "ios";
  appId: string;
  metroBaseUrl: string;
  policyProfile: string;
  runnerProfile: string;
  runtimeMode: ReactNativeRuntimeMode;
  appArtifact?: string;
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  stableSelectors: string[];
  deviceId?: string;
}

export interface ReactNativeReadinessCheck {
  id: "runtime-mode" | "device-inventory" | "metro-inspector" | "js-debug-target" | "readiness-contract" | "stable-selectors";
  status: "passed" | "blocked";
  reasonCode: ReactNativeReadinessReasonCode;
  detail: string;
  evidence: string[];
  nextActions: string[];
}

export interface ReactNativeReadinessResult {
  schema: "react-native-readiness/v1";
  runId: string;
  verdict: ReactNativeReadinessVerdict;
  proofLevel: ReactNativeReadinessProofLevel;
  platform: "android" | "ios";
  appId: string;
  metroBaseUrl: string;
  policyProfile: string;
  runnerProfile: string;
  runtimeMode: ReactNativeRuntimeMode;
  runtimeRequirements: {
    requiresMetroInspector: boolean;
    requiresJsDebugTarget: boolean;
    requiresAppArtifact: boolean;
    entryStrategy: ReactNativeRuntimeModeContractEntry["entryStrategy"];
  };
  appArtifact?: string;
  selectedDeviceId?: string;
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  stableSelectors: string[];
  checks: ReactNativeReadinessCheck[];
  blockers: ReactNativeReadinessCheck[];
  nextAction: {
    kind:
      | "run_react_native_verification"
      | "connect_device_or_use_self_hosted_runner"
      | "authorize_device"
      | "restart_or_select_online_device"
      | "select_requested_device"
      | "start_metro_or_expo"
      | "attach_react_native_debug_target"
      | "define_readiness_contract"
      | "add_stable_selectors";
    command: string;
    reason: string;
  };
  boundaries: string[];
}

export interface ReactNativeReadinessDependencies {
  listDevices: () => Promise<unknown>;
  listJsDebugTargets: () => Promise<unknown>;
}

const evidenceDir = "docs/showcase/evidence/react-native-readiness";
const summaryPath = `${evidenceDir}/summary.json`;
const reportPath = `${evidenceDir}/report.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function blockedCheck(input: {
  id: ReactNativeReadinessCheck["id"];
  reasonCode: ReactNativeReadinessReasonCode;
  detail: string;
  evidence: string[];
  nextActions: string[];
}): ReactNativeReadinessCheck {
  return {
    id: input.id,
    status: "blocked",
    reasonCode: input.reasonCode,
    detail: input.detail,
    evidence: input.evidence,
    nextActions: input.nextActions,
  };
}

function passedCheck(input: {
  id: ReactNativeReadinessCheck["id"];
  detail: string;
  evidence: string[];
}): ReactNativeReadinessCheck {
  return {
    id: input.id,
    status: "passed",
    reasonCode: "OK",
    detail: input.detail,
    evidence: input.evidence,
    nextActions: [],
  };
}

function runtimeModeCheck(input: {
  runtimeMode: ReactNativeRuntimeMode;
  appArtifact?: string;
}): {
  entry: ReactNativeRuntimeModeContractEntry;
  check: ReactNativeReadinessCheck;
} {
  const entry = findReactNativeRuntimeMode(defaultReactNativeRuntimeContract(), input.runtimeMode);
  if (entry.requiresAppArtifact && !input.appArtifact) {
    return {
      entry,
      check: blockedCheck({
        id: "runtime-mode",
        reasonCode: "APP_ARTIFACT_REQUIRED",
        detail: `${input.runtimeMode} requires an app artifact before live RN verification.`,
        evidence: [`runtimeMode: ${input.runtimeMode}`, `entryStrategy: ${entry.entryStrategy}`],
        nextActions: ["Provide M2E_RN_APP_ARTIFACT or choose a debug/dev runtime mode."],
      }),
    };
  }

  return {
    entry,
    check: passedCheck({
      id: "runtime-mode",
      detail: `Runtime mode ${input.runtimeMode} uses ${entry.entryStrategy}.`,
      evidence: [
        `requiresMetroInspector: ${entry.requiresMetroInspector}`,
        `requiresJsDebugTarget: ${entry.requiresJsDebugTarget}`,
        `requiresAppArtifact: ${entry.requiresAppArtifact}`,
      ],
    }),
  };
}

function isUnauthorized(device: Record<string, unknown>): boolean {
  const state = stringField(device, "state", "status", "authorization", "authState")?.toLowerCase();
  return device.authorized === false || state === "unauthorized" || state === "unauthorised";
}

function isOffline(device: Record<string, unknown>): boolean {
  const state = stringField(device, "state", "status")?.toLowerCase();
  return state === "offline" || state === "disconnected";
}

function isReady(device: Record<string, unknown>): boolean {
  return Boolean(stringField(device, "id", "udid")) && device.available !== false && !isUnauthorized(device) && !isOffline(device);
}

function deviceInventoryCheck(listDevicesResult: unknown, platform: "android" | "ios", requestedDeviceId?: string): {
  selectedDeviceId?: string;
  check: ReactNativeReadinessCheck;
} {
  const result = asRecord(listDevicesResult);
  if (result.status && result.status !== "success") {
    return {
      check: blockedCheck({
        id: "device-inventory",
        reasonCode: "DEVICE_UNAVAILABLE",
        detail: "Device inventory failed before RN verification could start.",
        evidence: [`list_devices status: ${String(result.status)}`, `reasonCode: ${String(result.reasonCode ?? "unknown")}`],
        nextActions: ["Repair platform tooling or rerun on a self-hosted device runner."],
      }),
    };
  }

  const data = asRecord(result.data);
  const devices = Array.isArray(data[platform]) ? data[platform].map(asRecord) : [];
  const ids = devices.map((device) => stringField(device, "id", "udid") ?? "unknown");

  if (requestedDeviceId) {
    const requested = devices.find((device) => stringField(device, "id", "udid") === requestedDeviceId);
    if (!requested) {
      return {
        check: blockedCheck({
          id: "device-inventory",
          reasonCode: "REQUESTED_DEVICE_UNAVAILABLE",
          detail: `Requested ${platform} device is not visible: ${requestedDeviceId}.`,
          evidence: [`requestedDeviceId: ${requestedDeviceId}`, `seenDevices: ${ids.join(",") || "none"}`],
          nextActions: ["Connect the requested device, clear M2E_DEVICE_ID, or choose a visible device id."],
        }),
      };
    }
    if (isReady(requested)) {
      return {
        selectedDeviceId: requestedDeviceId,
        check: passedCheck({
          id: "device-inventory",
          detail: `Selected requested ${platform} device ${requestedDeviceId}.`,
          evidence: [`deviceId: ${requestedDeviceId}`],
        }),
      };
    }
  }

  const ready = devices.find(isReady);
  if (ready) {
    const selectedDeviceId = stringField(ready, "id", "udid");
    return {
      selectedDeviceId,
      check: passedCheck({
        id: "device-inventory",
        detail: `Selected ${platform} device ${selectedDeviceId}.`,
        evidence: [`deviceId: ${selectedDeviceId}`],
      }),
    };
  }

  const unauthorized = devices.find(isUnauthorized);
  if (unauthorized) {
    const deviceId = stringField(unauthorized, "id", "udid") ?? "unknown";
    return {
      check: blockedCheck({
        id: "device-inventory",
        reasonCode: "DEVICE_UNAUTHORIZED",
        detail: `${platform} device ${deviceId} is connected but unauthorized.`,
        evidence: [`deviceId: ${deviceId}`, `state: ${stringField(unauthorized, "state", "status", "authorization", "authState") ?? "unauthorized"}`],
        nextActions: ["Accept USB debugging authorization, reconnect the device, then rerun RN readiness."],
      }),
    };
  }

  const offline = devices.find((device) => isOffline(device) || device.available === false);
  if (offline) {
    const deviceId = stringField(offline, "id", "udid") ?? "unknown";
    return {
      check: blockedCheck({
        id: "device-inventory",
        reasonCode: "DEVICE_OFFLINE",
        detail: `${platform} device ${deviceId} is offline or unavailable.`,
        evidence: [`deviceId: ${deviceId}`, `state: ${stringField(offline, "state", "status") ?? "unavailable"}`],
        nextActions: ["Reconnect the device or select an online device."],
      }),
    };
  }

  return {
    check: blockedCheck({
      id: "device-inventory",
      reasonCode: "DEVICE_UNAVAILABLE",
      detail: `No eligible ${platform} device is visible.`,
      evidence: [`seenDevices: ${ids.join(",") || "none"}`],
      nextActions: ["Connect a device/emulator or use a self-hosted runner with visible devices."],
    }),
  };
}

function metroChecks(result: unknown, metroBaseUrl: string, requirements: ReactNativeRuntimeModeContractEntry): ReactNativeReadinessCheck[] {
  if (!requirements.requiresMetroInspector && !requirements.requiresJsDebugTarget) {
    return [
      passedCheck({
        id: "metro-inspector",
        detail: `Metro inspector is not required for ${requirements.mode}.`,
        evidence: [`runtimeMode: ${requirements.mode}`, "requiresMetroInspector: false"],
      }),
      passedCheck({
        id: "js-debug-target",
        detail: `JS debug target is not required for ${requirements.mode}.`,
        evidence: [`runtimeMode: ${requirements.mode}`, "requiresJsDebugTarget: false"],
      }),
    ];
  }

  const record = asRecord(result);
  const data = asRecord(record.data);
  const targetCount = typeof data.targetCount === "number" ? data.targetCount : 0;
  const endpoint = typeof data.endpoint === "string" ? data.endpoint : `${metroBaseUrl}/json/list`;

  if (record.status !== "success") {
    return [
      blockedCheck({
        id: "metro-inspector",
        reasonCode: "METRO_UNAVAILABLE",
        detail: "Metro inspector endpoint is not reachable.",
        evidence: [`metroBaseUrl: ${metroBaseUrl}`, `endpoint: ${endpoint}`, `status: ${String(record.status ?? "unknown")}`],
        nextActions: ["Start Metro or Expo dev server, then verify /json/list is reachable."],
      }),
      blockedCheck({
        id: "js-debug-target",
        reasonCode: "NO_JS_DEBUG_TARGET",
        detail: "No RN/Expo debug target can be selected because Metro is unavailable.",
        evidence: [`targetCount: ${targetCount}`],
        nextActions: ["Start Metro, launch the RN app in debug/dev mode, and reload it so a JS debug target appears."],
      }),
    ];
  }

  const checks = [
    passedCheck({
      id: "metro-inspector",
      detail: "Metro inspector endpoint is reachable.",
      evidence: [`endpoint: ${endpoint}`],
    }),
  ];

  checks.push(targetCount > 0
    ? passedCheck({
        id: "js-debug-target",
        detail: `Metro reports ${targetCount} debuggable JS target(s).`,
        evidence: [`targetCount: ${targetCount}`],
      })
    : blockedCheck({
        id: "js-debug-target",
        reasonCode: "NO_JS_DEBUG_TARGET",
        detail: "Metro is reachable but no RN/Expo debug target is attached.",
        evidence: [`targetCount: ${targetCount}`],
        nextActions: ["Launch the RN app in debug/dev mode and reload it so Metro exposes a JS debug target."],
      }));

  return checks;
}

function readinessContractCheck(expected: ReactNativeReadinessOptions["expectedReadiness"]): ReactNativeReadinessCheck {
  return expected.screenId || expected.appPhase
    ? passedCheck({
        id: "readiness-contract",
        detail: "A deterministic readiness expectation is configured.",
        evidence: [`screenId: ${expected.screenId ?? "not-specified"}`, `appPhase: ${expected.appPhase ?? "not-specified"}`],
      })
    : blockedCheck({
        id: "readiness-contract",
        reasonCode: "READINESS_CONTRACT_MISSING",
        detail: "RN verification requires a deterministic screen id or app phase.",
        evidence: ["expectedReadiness.screenId and expectedReadiness.appPhase are both empty."],
        nextActions: ["Define M2E_RN_EXPECTED_SCREEN_ID or M2E_RN_EXPECTED_APP_PHASE before live RN verification."],
      });
}

function stableSelectorCheck(stableSelectors: string[]): ReactNativeReadinessCheck {
  return stableSelectors.length > 0
    ? passedCheck({
        id: "stable-selectors",
        detail: `${stableSelectors.length} stable RN selector(s) are declared.`,
        evidence: stableSelectors.map((selector) => `selector: ${selector}`),
      })
    : blockedCheck({
        id: "stable-selectors",
        reasonCode: "STABLE_SELECTOR_CONTRACT_MISSING",
        detail: "No stable RN testID/accessibility selector contract is declared.",
        evidence: ["stableSelectors is empty."],
        nextActions: ["Add testID/accessibility identifiers for critical RN controls and pass M2E_RN_STABLE_SELECTORS."],
      });
}

function nextActionFor(blockers: ReactNativeReadinessCheck[]): ReactNativeReadinessResult["nextAction"] {
  const first = blockers[0];
  if (!first) {
    return {
      kind: "run_react_native_verification",
      command: "pnpm run verify:react-native-change",
      reason: "RN readiness checks passed, so the RN verification lane can proceed.",
    };
  }
  if (first.reasonCode === "DEVICE_UNAUTHORIZED") {
    return { kind: "authorize_device", command: "adb devices -l", reason: "Authorize the selected device before running RN verification." };
  }
  if (first.reasonCode === "DEVICE_OFFLINE") {
    return { kind: "restart_or_select_online_device", command: "adb devices -l", reason: "Reconnect or select an online device before RN verification." };
  }
  if (first.reasonCode === "REQUESTED_DEVICE_UNAVAILABLE") {
    return { kind: "select_requested_device", command: "M2E_DEVICE_ID=<visible-device-id> pnpm run validate:react-native-readiness", reason: "The requested device is not visible." };
  }
  if (first.reasonCode === "METRO_UNAVAILABLE") {
    return { kind: "start_metro_or_expo", command: "npx react-native start", reason: "Metro inspector must be reachable before RN debug evidence can be trusted." };
  }
  if (first.reasonCode === "NO_JS_DEBUG_TARGET") {
    return { kind: "attach_react_native_debug_target", command: "pnpm run validate:react-native-readiness", reason: "Launch or reload the RN app so Metro exposes a JS debug target." };
  }
  if (first.reasonCode === "READINESS_CONTRACT_MISSING") {
    return { kind: "define_readiness_contract", command: "M2E_RN_EXPECTED_APP_PHASE=authentication pnpm run validate:react-native-readiness", reason: "A deterministic readiness expectation is required." };
  }
  if (first.reasonCode === "STABLE_SELECTOR_CONTRACT_MISSING") {
    return { kind: "add_stable_selectors", command: "M2E_RN_STABLE_SELECTORS=login.email,login.submit pnpm run validate:react-native-readiness", reason: "Stable testID/accessibility selectors are required for deterministic RN verification." };
  }
  return { kind: "connect_device_or_use_self_hosted_runner", command: "pnpm run validate:react-native-readiness", reason: "Connect an eligible device or run on a self-hosted runner." };
}

export async function buildReactNativeReadiness(
  options: ReactNativeReadinessOptions,
  deps: ReactNativeReadinessDependencies,
): Promise<ReactNativeReadinessResult> {
  const runtime = runtimeModeCheck({ runtimeMode: options.runtimeMode, appArtifact: options.appArtifact });
  const inventory = deviceInventoryCheck(await deps.listDevices(), options.platform, options.deviceId);
  const jsDebugResult = runtime.entry.requiresMetroInspector || runtime.entry.requiresJsDebugTarget
    ? await deps.listJsDebugTargets()
    : { status: "skipped", data: { targetCount: 0, targets: [] } };
  const checks = [
    runtime.check,
    inventory.check,
    ...metroChecks(jsDebugResult, options.metroBaseUrl, runtime.entry),
    readinessContractCheck(options.expectedReadiness),
    stableSelectorCheck(options.stableSelectors),
  ];
  const blockers = checks.filter((check) => check.status === "blocked");

  return {
    schema: "react-native-readiness/v1",
    runId: options.runId,
    verdict: blockers.length > 0 ? "blocked_before_react_native_verification" : "ready_for_react_native_verification",
    proofLevel: blockers.length > 0 ? "blocked_before_live" : "readiness_candidate",
    platform: options.platform,
    appId: options.appId,
    metroBaseUrl: options.metroBaseUrl,
    policyProfile: options.policyProfile,
    runnerProfile: options.runnerProfile,
    runtimeMode: options.runtimeMode,
    runtimeRequirements: {
      requiresMetroInspector: runtime.entry.requiresMetroInspector,
      requiresJsDebugTarget: runtime.entry.requiresJsDebugTarget,
      requiresAppArtifact: runtime.entry.requiresAppArtifact,
      entryStrategy: runtime.entry.entryStrategy,
    },
    appArtifact: options.appArtifact,
    selectedDeviceId: inventory.selectedDeviceId,
    expectedReadiness: options.expectedReadiness,
    stableSelectors: options.stableSelectors,
    checks,
    blockers,
    nextAction: nextActionFor(blockers),
    boundaries: [
      "RN readiness is a preflight and does not prove app success by itself.",
      "Metro/JS debug evidence is supplemental; native UI post-condition evidence remains the proof backbone.",
      "Stable testID/accessibility selectors and deterministic readiness contracts are required before live RN success can be trusted.",
    ],
  };
}

export function renderReactNativeReadinessMarkdown(result: ReactNativeReadinessResult): string {
  const checkLines = result.checks.map((check) => `- ${check.id}: \`${check.status}\` (${check.reasonCode}) - ${check.detail}`);
  const blockerLines = result.blockers.length > 0
    ? result.blockers.map((check) => `- ${check.reasonCode}: ${check.detail}`)
    : ["- none"];
  const boundaryLines = result.boundaries.map((boundary) => `- ${boundary}`);

  return [
    "## React Native readiness",
    "",
    `Verdict: \`${result.verdict}\``,
    `Proof level: \`${result.proofLevel}\``,
    `Run ID: \`${result.runId}\``,
    `Platform: \`${result.platform}\``,
    `App ID: \`${result.appId}\``,
    `Metro: \`${result.metroBaseUrl}\``,
    `Runtime mode: \`${result.runtimeMode}\``,
    `Selected device: \`${result.selectedDeviceId ?? "none"}\``,
    "",
    "Checks:",
    ...checkLines,
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Next action:",
    `- \`${result.nextAction.kind}\`: ${result.nextAction.reason}`,
    `- Command: \`${result.nextAction.command}\``,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

export function validateReactNativeReadiness(result: ReactNativeReadinessResult): void {
  assert.equal(result.schema, "react-native-readiness/v1");
  assert.ok(result.checks.length >= 6, "RN readiness must report runtime, device, Metro, debug target, readiness, and selector checks");
  assert.ok(result.boundaries.some((boundary) => boundary.includes("does not prove app success")), "readiness boundary must prevent success overclaim");
  if (result.verdict === "ready_for_react_native_verification") {
    assert.equal(result.blockers.length, 0, "ready RN readiness cannot include blockers");
    assert.equal(result.proofLevel, "readiness_candidate");
  } else {
    assert.ok(result.blockers.length > 0, "blocked RN readiness must include blockers");
    assert.equal(result.proofLevel, "blocked_before_live");
  }
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-readiness`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function stableSelectorsFromEnv(): string[] {
  return (process.env.M2E_RN_STABLE_SELECTORS ?? "login-screen,phone-input,password-input,login-button")
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean);
}

export async function writeReactNativeReadiness(check: boolean): Promise<ReactNativeReadinessResult> {
  const server = createServer();
  const metroBaseUrl = process.env.M2E_RN_METRO_BASE_URL ?? "http://127.0.0.1:8081";
  const deps: ReactNativeReadinessDependencies = {
    listDevices: process.env.M2E_RN_READINESS_FORCE_NO_DEVICE === "1"
      ? async () => ({ status: "success", reasonCode: "OK", data: { android: [], ios: [] } })
      : () => server.invoke("list_devices", { includeUnavailable: true }),
    listJsDebugTargets: process.env.M2E_RN_READINESS_FORCE_METRO_UNAVAILABLE === "1"
      ? async () => ({ status: "failed", reasonCode: "CONFIGURATION_ERROR", data: { metroBaseUrl, endpoint: `${metroBaseUrl}/json/list`, targetCount: 0, targets: [] } })
      : () => listJsDebugTargetsWithMaestro({ metroBaseUrl, timeoutMs: 1000 }),
  };
  const result = await buildReactNativeReadiness({
    runId: process.env.M2E_RN_READINESS_RUN_ID ?? "react-native-readiness-2026-06-01",
    platform: (process.env.M2E_RN_PLATFORM as "android" | "ios" | undefined) ?? "android",
    appId: process.env.M2E_RN_APP_ID ?? "com.anonymous.rnlogindemo",
    metroBaseUrl,
    policyProfile: process.env.M2E_RN_POLICY_PROFILE ?? "interactive",
    runnerProfile: process.env.M2E_RN_RUNNER_PROFILE ?? "react_native_android",
    runtimeMode: (process.env.M2E_RN_RUNTIME_MODE as ReactNativeRuntimeMode | undefined) ?? "bare_debug",
    appArtifact: process.env.M2E_RN_APP_ARTIFACT,
    expectedReadiness: {
      screenId: process.env.M2E_RN_EXPECTED_SCREEN_ID ?? "login",
      appPhase: process.env.M2E_RN_EXPECTED_APP_PHASE ?? "authentication",
    },
    stableSelectors: stableSelectorsFromEnv(),
    deviceId: process.env.M2E_DEVICE_ID,
  }, deps);
  validateReactNativeReadiness(result);
  await writeOrCheck(summaryPath, `${JSON.stringify(result, null, 2)}\n`, check);
  await writeOrCheck(reportPath, renderReactNativeReadinessMarkdown(result), check);
  return result;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const result = await writeReactNativeReadiness(check);
  console.log(check ? "React Native readiness evidence is up to date." : `React Native readiness evidence written to ${evidenceDir}`);
  console.log(JSON.stringify({
    verdict: result.verdict,
    proofLevel: result.proofLevel,
    blockers: result.blockers.map((blocker) => blocker.reasonCode),
    nextAction: result.nextAction.kind,
  }, null, 2));
  if (result.verdict !== "ready_for_react_native_verification" && process.env.M2E_RN_READINESS_ALLOW_BLOCKED !== "1") {
    process.exitCode = 1;
  }
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
