import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface MobileChangeLiveSettingsLane {
  schema: "mobile-change-live-settings-lane/v1";
  platform: "android";
  appId: "com.android.settings";
  deviceId?: string;
  runId: string;
  policyProfile: "interactive";
  runnerProfile: "native_android";
  expectedReadiness: {
    screenId?: string;
    appPhase?: string;
  };
  command: string;
  intakeCommand: string;
  evidenceDir: string;
  successCriteria: string[];
  boundaries: string[];
}

const evidenceDir = "docs/showcase/evidence/mobile-change-live-settings-lane";
const laneJsonPath = `${evidenceDir}/lane.json`;
const laneMarkdownPath = `${evidenceDir}/lane.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function shellEnv(name: string, value: string): string {
  return `${name}=${value}`;
}

export function buildMobileChangeLiveSettingsLane(input: {
  deviceId?: string;
  runId?: string;
} = {}): MobileChangeLiveSettingsLane {
  const runId = input.runId ?? "android-settings-live-success";
  const envParts = [
    input.deviceId ? shellEnv("M2E_DEVICE_ID", input.deviceId) : undefined,
    shellEnv("M2E_LIVE_MOBILE_CHANGE_RUN_ID", runId),
    shellEnv("M2E_LIVE_MOBILE_CHANGE_APP_ID", "com.android.settings"),
    shellEnv("M2E_LIVE_MOBILE_CHANGE_POLICY_PROFILE", "interactive"),
    shellEnv("M2E_LIVE_MOBILE_CHANGE_RUNNER_PROFILE", "native_android"),
  ].filter((part): part is string => Boolean(part));

  return {
    schema: "mobile-change-live-settings-lane/v1",
    platform: "android",
    appId: "com.android.settings",
    deviceId: input.deviceId,
    runId,
    policyProfile: "interactive",
    runnerProfile: "native_android",
    expectedReadiness: {},
    command: `${envParts.join(" ")} pnpm run proof:mobile-change-verification:live`,
    intakeCommand: `pnpm run intake:mobile-change-live-proof -- output/showcase/mobile-change-verification-live/${runId}`,
    evidenceDir: `output/showcase/mobile-change-verification-live/${runId}`,
    successCriteria: [
      "Device discovery succeeds for the requested Android device.",
      "The governed session starts under the interactive policy profile.",
      "The Android Settings app launches without requiring an APK build or install.",
      "UI inspection and screen-summary collection succeed.",
      "The verification bundle verdict is mobile_change_verified.",
    ],
    boundaries: [
      "This lane targets Android Settings as a built-in app so the success path does not depend on a repo-built APK.",
      "No APK build or install is required.",
      "The lane is a runnable proof recipe. It does not claim live success until the command is executed and the resulting bundle passes intake.",
      "For app-under-test claims, replace the appId and add a deterministic readiness contract backed by app evidence.",
    ],
  };
}

export function renderMobileChangeLiveSettingsLaneMarkdown(lane: MobileChangeLiveSettingsLane): string {
  const successLines = lane.successCriteria.map((item) => `- ${item}`);
  const boundaryLines = lane.boundaries.map((item) => `- ${item}`);
  return [
    "## Mobile change live Settings lane",
    "",
    `Platform: \`${lane.platform}\``,
    `App: \`${lane.appId}\``,
    `Device: \`${lane.deviceId ?? "first-available"}\``,
    `Run ID: \`${lane.runId}\``,
    "",
    "Command:",
    `- \`${lane.command}\``,
    "",
    "Intake:",
    `- \`${lane.intakeCommand}\``,
    "",
    "Success criteria:",
    ...successLines,
    "",
    "Boundaries:",
    ...boundaryLines,
    "",
  ].join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeMobileChangeLiveSettingsLane(check: boolean): Promise<MobileChangeLiveSettingsLane> {
  const lane = buildMobileChangeLiveSettingsLane({
    deviceId: process.env.M2E_SETTINGS_LIVE_LANE_DEVICE_ID || "10AEA40Z3Y000R5",
    runId: process.env.M2E_SETTINGS_LIVE_LANE_RUN_ID || "android-settings-live-success-2026-05-29",
  });
  await writeOrCheck(laneJsonPath, `${JSON.stringify(lane, null, 2)}\n`, check);
  await writeOrCheck(laneMarkdownPath, renderMobileChangeLiveSettingsLaneMarkdown(lane), check);
  return lane;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const lane = await writeMobileChangeLiveSettingsLane(check);
  console.log(check ? "Mobile change live Settings lane is up to date." : `Mobile change live Settings lane written to ${evidenceDir}`);
  console.log(JSON.stringify({
    appId: lane.appId,
    deviceId: lane.deviceId ?? null,
    runId: lane.runId,
    command: lane.command,
  }, null, 2));
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
