import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface DeviceReadinessShape {
  summary: {
    schema?: string;
    verdict?: string;
    platform?: string;
    appId?: string;
    checks?: Array<{
      id?: string;
      status?: string;
      reasonCode?: string;
      diagnostic?: {
        blockerType?: string;
        evidence?: string[];
        nextActions?: string[];
      };
    }>;
    blockers?: Array<{
      id?: string;
      status?: string;
      reasonCode?: string;
      diagnostic?: {
        blockerType?: string;
        evidence?: string[];
        nextActions?: string[];
      };
    }>;
    nextAction?: {
      kind?: string;
    };
    boundaries?: string[];
  };
  reportMarkdown: string;
}

const evidenceDir = "docs/showcase/evidence/mobile-change-device-readiness";
const summaryPath = `${evidenceDir}/summary.json`;
const reportPath = `${evidenceDir}/report.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function includesBoundary(values: string[] | undefined, expected: string): boolean {
  return values?.some((value) => value.includes(expected)) ?? false;
}

export function validateMobileChangeDeviceReadinessShape(shape: DeviceReadinessShape): void {
  assert.equal(shape.summary.schema, "mobile-change-device-readiness/v1");
  assert.ok(shape.summary.platform === "android" || shape.summary.platform === "ios", "platform must be android or ios");
  assert.equal(typeof shape.summary.appId, "string");
  assert.ok((shape.summary.appId?.length ?? 0) > 0, "appId must be populated");
  assert.ok((shape.summary.checks?.length ?? 0) >= 2, "preflight must include device and readiness checks");
  assert.ok(shape.summary.checks?.some((check) => check.id === "device-inventory"), "preflight must include device inventory check");
  assert.ok(shape.summary.checks?.some((check) => check.id === "readiness-contract"), "preflight must include readiness contract check");
  assert.ok(includesBoundary(shape.summary.boundaries, "does not claim physical-device proof"));

  const blockers = shape.summary.blockers ?? [];
  if (shape.summary.verdict === "ready_for_live_mobile_change_verification") {
    assert.equal(blockers.length, 0, "ready preflight must not include blockers");
    assert.equal(shape.summary.nextAction?.kind, "run_live_mobile_change_verification");
  } else {
    assert.equal(shape.summary.verdict, "blocked_before_live_verification");
    assert.ok(blockers.length > 0, "blocked preflight must include at least one blocker");
    for (const blocker of blockers) {
      assert.ok(blocker.diagnostic?.blockerType, "blocked checks must include structured diagnostics");
      assert.ok((blocker.diagnostic.evidence?.length ?? 0) > 0, "blocked diagnostics must include evidence");
      assert.ok((blocker.diagnostic.nextActions?.length ?? 0) > 0, "blocked diagnostics must include next actions");
    }
    assert.notEqual(shape.summary.nextAction?.kind, "run_live_mobile_change_verification");
  }

  assert.match(shape.reportMarkdown, /## Mobile change device readiness/);
  assert.match(shape.reportMarkdown, new RegExp(`Verdict: \`${shape.summary.verdict}\``));
}

export async function validateMobileChangeDeviceReadiness(): Promise<void> {
  validateMobileChangeDeviceReadinessShape({
    summary: await readJson(summaryPath),
    reportMarkdown: await readFile(path.join(repoRoot(), reportPath), "utf8"),
  });
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeDeviceReadiness().then(() => {
    console.log("Mobile change device readiness validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
