import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface LiveAndroidEvidenceShape {
  summary: {
    schema?: string;
    source?: string;
    verdict?: string;
    validationSurface?: {
      platform?: string;
      appId?: string;
      policyProfile?: string;
    };
    readiness?: {
      matched?: boolean;
      expectedAppPhase?: string;
    };
    workflow?: {
      stepIds?: string[];
      steps?: Array<{
        id?: string;
        status?: string;
        reasonCode?: string;
      }>;
    };
    evidence?: {
      artifacts?: Array<{
        kind?: string;
        path?: string;
      }>;
    };
  };
  failurePacket: {
    schema?: string;
    source?: string;
    category?: string;
    reasonCode?: string;
    failedStep?: {
      id?: string;
      reasonCode?: string;
    };
    evidence?: {
      signals?: {
        deviceUnavailable?: boolean;
        appNotReady?: boolean;
      };
    };
    nextAction?: {
      kind?: string;
    };
  };
  reportMarkdown: string;
  failureMarkdown: string;
  inspectUiXml: string;
}

const evidenceDir = "docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5";
const summaryPath = `${evidenceDir}/summary.json`;
const reportPath = `${evidenceDir}/report.md`;
const failurePacketPath = `${evidenceDir}/failure-packet.json`;
const failureMarkdownPath = `${evidenceDir}/failure-packet.md`;
const inspectUiPath = `${evidenceDir}/inspect-ui.xml`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function hasStep(shape: LiveAndroidEvidenceShape, id: string, status?: string, reasonCode?: string): boolean {
  return Boolean(shape.summary.workflow?.steps?.some((step) =>
    step.id === id &&
    (status === undefined || step.status === status) &&
    (reasonCode === undefined || step.reasonCode === reasonCode)));
}

export function validateMobileChangeLiveAndroidEvidenceShape(shape: LiveAndroidEvidenceShape): void {
  assert.equal(shape.summary.schema, "mobile-change-verification/v1");
  assert.equal(shape.summary.source, "live_device");
  assert.notEqual(shape.summary.verdict, "device_unavailable", "live Android evidence must not be a no-device proof");
  assert.equal(shape.summary.verdict, "mobile_change_verification_failed");
  assert.equal(shape.summary.validationSurface?.platform, "android");
  assert.equal(shape.summary.validationSurface?.appId, "com.example.mobilechange");
  assert.equal(shape.summary.validationSurface?.policyProfile, "interactive");
  assert.equal(shape.summary.readiness?.matched, false);
  assert.equal(shape.summary.readiness?.expectedAppPhase, "authentication");
  assert.ok(shape.summary.workflow?.stepIds?.includes("discover-device"));
  assert.ok(shape.summary.workflow?.stepIds?.includes("inspect-readiness"));
  assert.ok(hasStep(shape, "discover-device", "success", "OK"), "live proof must discover the Android device");
  assert.ok(hasStep(shape, "start-session", "success", "OK"), "live proof must start a governed session");
  assert.ok(hasStep(shape, "inspect-readiness", "success", "OK"), "live proof must collect UI evidence");
  assert.ok(hasStep(shape, "check-readiness", "failed", "APP_NOT_READY"), "live proof must capture readiness mismatch");
  assert.ok(shape.summary.evidence?.artifacts?.some((artifact) => artifact.kind === "ui_tree" && artifact.path?.endsWith("inspect-ui.xml")));
  assert.ok(shape.summary.evidence?.artifacts?.some((artifact) => artifact.kind === "failure_packet"));

  assert.equal(shape.failurePacket.schema, "mobile-verification-failure-packet/v1");
  assert.equal(shape.failurePacket.source, "live_device");
  assert.equal(shape.failurePacket.category, "app_readiness");
  assert.equal(shape.failurePacket.reasonCode, "ADAPTER_ERROR");
  assert.equal(shape.failurePacket.failedStep?.id, "launch-app");
  assert.equal(shape.failurePacket.evidence?.signals?.appNotReady, true);
  assert.equal(shape.failurePacket.evidence?.signals?.deviceUnavailable, false);
  assert.equal(shape.failurePacket.nextAction?.kind, "wait_or_fix_readiness_contract");

  assert.match(shape.reportMarkdown, /Verdict: `mobile_change_verification_failed`/);
  assert.match(shape.failureMarkdown, /Category: `app_readiness`/);
  assert.match(shape.inspectUiXml, /<hierarchy/);
}

export async function validateMobileChangeLiveAndroidEvidence(): Promise<void> {
  validateMobileChangeLiveAndroidEvidenceShape({
    summary: await readJson(summaryPath),
    failurePacket: await readJson(failurePacketPath),
    reportMarkdown: await readFile(path.join(repoRoot(), reportPath), "utf8"),
    failureMarkdown: await readFile(path.join(repoRoot(), failureMarkdownPath), "utf8"),
    inspectUiXml: await readFile(path.join(repoRoot(), inspectUiPath), "utf8"),
  });
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeLiveAndroidEvidence().then(() => {
    console.log("Mobile change live Android evidence validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
