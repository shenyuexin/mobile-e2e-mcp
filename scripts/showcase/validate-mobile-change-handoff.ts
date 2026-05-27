import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface HandoffSummary {
  schema?: string;
  intendedSurface?: string;
  sourceVerification?: string;
  sourceFailurePacket?: string;
  verdict?: string;
  surface?: {
    platform?: string;
    appId?: string;
    policyProfile?: string;
  };
  readiness?: {
    matched?: boolean;
  };
  artifacts?: Array<{
    kind?: string;
    path?: string;
  }>;
  nextAction?: {
    kind?: string;
  };
  nextCommand?: string;
  failure?: {
    category?: string;
    reasonCode?: string;
    failedStepId?: string;
    nextActionKind?: string;
  };
  boundaries?: string[];
}

const handoffJsonPath = "docs/showcase/evidence/mobile-change-readiness-failure/handoff.json";
const handoffMarkdownPath = "docs/showcase/evidence/mobile-change-readiness-failure/handoff.md";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

export function validateMobileChangeHandoffShape(summary: HandoffSummary, markdown: string): void {
  assert.equal(summary.schema, "mobile-change-handoff/v1");
  assert.equal(summary.intendedSurface, "pull_request_or_agent_handoff");
  assert.equal(summary.sourceVerification, "docs/showcase/evidence/mobile-change-readiness-failure/summary.json");
  assert.equal(summary.sourceFailurePacket, "docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json");
  assert.equal(summary.verdict, "mobile_change_verification_failed");
  assert.equal(summary.surface?.platform, "android");
  assert.equal(summary.surface?.appId, "com.example.mobilechange");
  assert.equal(summary.surface?.policyProfile, "interactive");
  assert.equal(summary.readiness?.matched, false);
  assert.ok(summary.artifacts?.some((artifact) => artifact.kind === "failure_packet"));
  assert.equal(summary.nextAction?.kind, "wait_or_fix_readiness_contract");
  assert.equal(summary.nextCommand, "pnpm run validate:mobile-change-readiness-failure");
  assert.equal(summary.failure?.category, "app_readiness");
  assert.equal(summary.failure?.reasonCode, "APP_NOT_READY");
  assert.equal(summary.failure?.failedStepId, "check-readiness");
  assert.equal(summary.failure?.nextActionKind, "wait_or_fix_readiness_contract");
  assert.ok(summary.boundaries?.some((boundary) => boundary.includes("does not post to GitHub")));

  assert.match(markdown, /## Mobile change handoff/);
  assert.match(markdown, /Failure excerpt:/);
  assert.match(markdown, /Category: `app_readiness`/);
  assert.match(markdown, /Next command:/);
  assert.match(markdown, /pnpm run validate:mobile-change-readiness-failure/);
}

export async function validateMobileChangeHandoff(): Promise<void> {
  validateMobileChangeHandoffShape(
    await readJson(handoffJsonPath),
    await readFile(path.join(repoRoot(), handoffMarkdownPath), "utf8"),
  );
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeHandoff().then(() => {
    console.log("Mobile change handoff validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
