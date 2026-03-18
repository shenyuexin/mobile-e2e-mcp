import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "../../packages/mcp-server/src/index.ts";

const execFileAsync = promisify(execFile);

interface StepResult {
  status: string;
  reasonCode?: string;
  data?: {
    screenSummary?: {
      screenTitle?: string;
      topVisibleTexts?: string[];
    };
  };
  nextSuggestions?: string[];
}

function toStepResult(value: unknown): StepResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("Tool result is not an object.");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status !== "string") {
    throw new Error("Tool result missing status field.");
  }
  return candidate as unknown as StepResult;
}

function ensureStep(stepName: string, result: StepResult, accepted: ReadonlyArray<string> = ["success"]): void {
  if (!accepted.includes(result.status)) {
    const reason = result.reasonCode ? ` (${result.reasonCode})` : "";
    const suggestions = result.nextSuggestions?.join(" | ") ?? "";
    throw new Error(`${stepName} failed: ${result.status}${reason}${suggestions ? `; suggestions: ${suggestions}` : ""}`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pickFirstOnlineAndroidDevice(adbDevicesOutput: string): string | undefined {
  const lines = adbDevicesOutput.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("List of devices attached")) {
      continue;
    }

    const [candidateDeviceId, state] = trimmed.split(/\s+/, 3);
    if (candidateDeviceId && state === "device") {
      return candidateDeviceId;
    }
  }
  return undefined;
}

async function resolveDeviceId(): Promise<string> {
  const explicitDeviceId = process.env.DEVICE_ID?.trim();
  if (explicitDeviceId) {
    return explicitDeviceId;
  }

  let adbDevicesOutput = "";
  try {
    const result = await execFileAsync("adb", ["devices"]);
    adbDevicesOutput = result.stdout;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run 'adb devices': ${message}`);
  }

  const autoDetectedDeviceId = pickFirstOnlineAndroidDevice(adbDevicesOutput);
  if (autoDetectedDeviceId) {
    return autoDetectedDeviceId;
  }

  throw new Error("No Android device is online. Start an emulator/device or set DEVICE_ID explicitly.");
}

async function main(): Promise<void> {
  const deviceId = await resolveDeviceId();
  const appId = process.env.APP_ID ?? "com.epam.mobitru";
  const sessionId = process.env.SESSION_ID ?? `interruption-home-recovery-${Date.now()}`;
  const server = createServer();
  const base = {
    sessionId,
    platform: "android" as const,
    runnerProfile: "native_android" as const,
    deviceId,
    appId,
  };

  const start = toStepResult(await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId,
    profile: "native_android",
    policyProfile: "sample-harness-default",
  }));
  ensureStep("start_session", start);

  const reset = toStepResult(await server.invoke("reset_app_state", {
    ...base,
    strategy: "clear_data",
  }));
  ensureStep("reset_app_state", reset);

  const launch = toStepResult(await server.invoke("launch_app", base));
  ensureStep("launch_app", launch);
  await sleep(1400);

  const quickLogin = toStepResult(await server.invoke("tap_element", {
    ...base,
    resourceId: "com.epam.mobitru:id/type_and_login",
  }));
  ensureStep("tap_element(type_and_login)", quickLogin);
  await sleep(2300);

  const beforeInterruption = toStepResult(await server.invoke("get_screen_summary", base));
  ensureStep("get_screen_summary(before_interruption)", beforeInterruption);

  await execFileAsync("adb", ["-s", deviceId, "shell", "input", "keyevent", "3"]);
  await sleep(1500);

  const interruptedSummary = toStepResult(await server.invoke("get_screen_summary", base));
  ensureStep("get_screen_summary(interrupted)", interruptedSummary);

  const detectInterruption = toStepResult(await server.invoke("detect_interruption", {
    sessionId,
  }));

  const classifyInterruption = toStepResult(await server.invoke("classify_interruption", {
    sessionId,
  }));

  const recover = toStepResult(await server.invoke("recover_to_known_state", base));
  ensureStep("recover_to_known_state", recover);
  await sleep(1800);

  const afterRecovery = toStepResult(await server.invoke("get_screen_summary", base));
  ensureStep("get_screen_summary(after_recovery)", afterRecovery);

  const addToCart = toStepResult(await server.invoke("tap_element", {
    ...base,
    contentDesc: "Add to cart Samsung Galaxy S10+ Plus 128GB",
  }));
  ensureStep("tap_element(add_to_cart_after_recovery)", addToCart);

  const end = toStepResult(await server.invoke("end_session", { sessionId }));
  ensureStep("end_session", end);

  console.log(JSON.stringify({
    sessionId,
    deviceId,
    appId,
    flow: [
      "launch_app",
      "quick_login(type_and_login)",
      "interrupt_with_HOME_key",
      "recover_to_known_state",
      "continue_action(add_to_cart)",
    ],
    beforeInterruptionTitle: beforeInterruption.data?.screenSummary?.screenTitle,
    interruptedTitle: interruptedSummary.data?.screenSummary?.screenTitle,
    interruptedTopVisibleTexts: interruptedSummary.data?.screenSummary?.topVisibleTexts?.slice(0, 8) ?? [],
    interruptionDetection: {
      status: detectInterruption.status,
      reasonCode: detectInterruption.reasonCode,
      classificationStatus: classifyInterruption.status,
      classificationReasonCode: classifyInterruption.reasonCode,
    },
    afterRecoveryTitle: afterRecovery.data?.screenSummary?.screenTitle,
    afterRecoveryTopVisibleTexts: afterRecovery.data?.screenSummary?.topVisibleTexts?.slice(0, 8) ?? [],
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[demo-interruption-home-recovery-android] ${message}`);
  process.exitCode = 1;
});
