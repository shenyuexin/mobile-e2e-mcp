import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface SettingsLaneShape {
  lane: {
    schema?: string;
    platform?: string;
    appId?: string;
    deviceId?: string;
    runId?: string;
    command?: string;
    successCriteria?: string[];
    boundaries?: string[];
  };
  markdown: string;
}

const laneJsonPath = "docs/showcase/evidence/mobile-change-live-settings-lane/lane.json";
const laneMarkdownPath = "docs/showcase/evidence/mobile-change-live-settings-lane/lane.md";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function includes(values: string[] | undefined, expected: string): boolean {
  return values?.some((value) => value.includes(expected)) ?? false;
}

export function validateMobileChangeLiveSettingsLaneShape(shape: SettingsLaneShape): void {
  assert.equal(shape.lane.schema, "mobile-change-live-settings-lane/v1");
  assert.equal(shape.lane.platform, "android");
  assert.equal(shape.lane.appId, "com.android.settings", "settings lane must target Android Settings");
  assert.ok(shape.lane.runId, "settings lane must include a stable run id");
  assert.match(shape.lane.command ?? "", /M2E_LIVE_MOBILE_CHANGE_APP_ID=com\.android\.settings/);
  assert.match(shape.lane.command ?? "", /proof:mobile-change-verification:live/);
  assert.ok(includes(shape.lane.successCriteria, "mobile_change_verified"), "settings lane must define success verdict criteria");
  assert.ok(includes(shape.lane.boundaries, "No APK build or install is required"));
  assert.ok(includes(shape.lane.boundaries, "does not claim live success"));
  assert.match(shape.markdown, /## Mobile change live Settings lane/);
  assert.match(shape.markdown, /App: `com\.android\.settings`/);
}

export async function validateMobileChangeLiveSettingsLane(): Promise<void> {
  validateMobileChangeLiveSettingsLaneShape({
    lane: await readJson(laneJsonPath),
    markdown: await readFile(path.join(repoRoot(), laneMarkdownPath), "utf8"),
  });
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeLiveSettingsLane().then(() => {
    console.log("Mobile change live Settings lane validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
