import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface ReadinessFailureShape {
  summary: {
    schema?: string;
    source?: string;
    verdict?: string;
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
    boundaries?: string[];
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
    nextAction?: {
      kind?: string;
    };
    boundaries?: string[];
  };
  reportMarkdown: string;
  failureMarkdown: string;
}

const evidenceDir = "docs/showcase/evidence/mobile-change-readiness-failure";
const summaryPath = `${evidenceDir}/summary.json`;
const reportPath = `${evidenceDir}/report.md`;
const failurePacketPath = `${evidenceDir}/failure-packet.json`;
const failureMarkdownPath = `${evidenceDir}/failure-packet.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function includesBoundary(values: string[] | undefined, expected: string): boolean {
  return values?.some((value) => value.includes(expected)) ?? false;
}

export function validateMobileChangeReadinessFailureShape(shape: ReadinessFailureShape): void {
  assert.equal(shape.summary.schema, "mobile-change-verification/v1");
  assert.equal(shape.summary.source, "live_device");
  assert.equal(shape.summary.verdict, "mobile_change_verification_failed");
  assert.equal(shape.summary.readiness?.matched, false);
  assert.equal(shape.summary.readiness?.expectedAppPhase, "authentication");
  assert.ok(shape.summary.workflow?.stepIds?.includes("check-readiness"), "summary must include the readiness check step");
  assert.ok(shape.summary.workflow?.steps?.some((step) => step.id === "check-readiness" && step.reasonCode === "APP_NOT_READY"));
  assert.ok(shape.summary.evidence?.artifacts?.some((artifact) => artifact.kind === "failure_packet"));

  assert.equal(shape.failurePacket.schema, "mobile-verification-failure-packet/v1");
  assert.equal(shape.failurePacket.source, "live_device");
  assert.equal(shape.failurePacket.category, "app_readiness", "failure packet must classify app readiness");
  assert.equal(shape.failurePacket.reasonCode, "APP_NOT_READY");
  assert.equal(shape.failurePacket.failedStep?.id, "check-readiness");
  assert.equal(shape.failurePacket.nextAction?.kind, "wait_or_fix_readiness_contract");
  assert.ok(includesBoundary(shape.failurePacket.boundaries, "do not autonomously fix"));

  assert.match(shape.reportMarkdown, /Verdict: `mobile_change_verification_failed`/);
  assert.match(shape.reportMarkdown, /Matched: `false`/);
  assert.match(shape.failureMarkdown, /Category: `app_readiness`/);
  assert.match(shape.failureMarkdown, /Reason code: `APP_NOT_READY`/);
}

export async function validateMobileChangeReadinessFailure(): Promise<void> {
  validateMobileChangeReadinessFailureShape({
    summary: await readJson(summaryPath),
    failurePacket: await readJson(failurePacketPath),
    reportMarkdown: await readFile(path.join(repoRoot(), reportPath), "utf8"),
    failureMarkdown: await readFile(path.join(repoRoot(), failureMarkdownPath), "utf8"),
  });
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeReadinessFailure().then(() => {
    console.log("Mobile change readiness failure validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
