import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface ValidationShapeInput {
  bundle: {
    schema?: string;
    verdict?: string;
    source?: string;
    validationSurface?: {
      platform?: string;
      appId?: string;
      policyProfile?: string;
    };
    readiness?: {
      matched?: boolean;
    };
    workflow?: {
      stepIds?: string[];
      steps?: Array<{
        id?: string;
        tool?: string;
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
    nextAction?: {
      kind?: string;
      command?: string;
    };
    boundaries?: string[];
  };
  failurePacket: {
    schema?: string;
    category?: string;
    confidence?: string;
    reasonCode?: string;
    evidence?: {
      artifacts?: Array<{
        kind?: string;
        path?: string;
      }>;
    };
    nextAction?: {
      kind?: string;
    };
    boundaries?: string[];
  };
  scenarioIndex: {
    schema?: string;
    verdict?: string;
    scenarioCount?: number;
    failurePacketCount?: number;
    scenarios?: Array<{
      id?: string;
      surface?: string;
      painPoint?: string;
      evidencePath?: string;
      verdict?: string;
      failurePacketPath?: string;
    }>;
    boundaries?: string[];
  };
  reportMarkdown: string;
  failureMarkdown: string;
  scenarioMarkdown: string;
}

const evidenceDir = "docs/showcase/evidence/mobile-change-verification-fixture";
const summaryJsonPath = `${evidenceDir}/summary.json`;
const reportMarkdownPath = `${evidenceDir}/report.md`;
const failurePacketJsonPath = `${evidenceDir}/failure-packet.json`;
const failurePacketMarkdownPath = `${evidenceDir}/failure-packet.md`;
const scenarioIndexJsonPath = `${evidenceDir}/scenario-index.json`;
const scenarioIndexMarkdownPath = `${evidenceDir}/scenario-index.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function assertStringArrayIncludes(values: string[] | undefined, expected: string, message: string): void {
  assert.ok(values?.some((value) => value.includes(expected)), message);
}

export function validateMobileChangeVerificationEvidenceShape(input: ValidationShapeInput): void {
  assert.equal(input.bundle.schema, "mobile-change-verification/v1");
  assert.equal(input.bundle.verdict, "mobile_change_verified");
  assert.equal(input.bundle.source, "fixture");
  assert.equal(input.bundle.validationSurface?.platform, "android");
  assert.ok(input.bundle.validationSurface?.appId, "bundle must include app id");
  assert.ok(input.bundle.validationSurface?.policyProfile, "bundle must include policy profile");
  assert.equal(input.bundle.readiness?.matched, true);
  assert.ok(
    (input.bundle.workflow?.steps?.length ?? input.bundle.workflow?.stepIds?.length ?? 0) >= 5,
    "workflow must include at least five governed verification steps",
  );
  assert.ok(input.bundle.workflow?.stepIds?.includes("inspect-readiness"));
  assert.ok(input.bundle.evidence?.artifacts?.some((artifact) => artifact.kind === "summary"));
  assert.ok(input.bundle.evidence?.artifacts?.some((artifact) => artifact.kind === "timeline"));
  assert.equal(input.bundle.nextAction?.kind, "attach_to_pr");
  assert.equal(input.bundle.nextAction?.command, "pnpm run validate:mobile-change-verification");
  assertStringArrayIncludes(input.bundle.boundaries, "fixture", "bundle must disclose fixture boundary");

  assert.equal(input.failurePacket.schema, "mobile-verification-failure-packet/v1");
  assert.equal(input.failurePacket.category, "network");
  assert.equal(input.failurePacket.confidence, "high");
  assert.equal(input.failurePacket.reasonCode, "NETWORK_POLICY_BLOCKED");
  assert.equal(input.failurePacket.nextAction?.kind, "inspect_network_policy");
  assert.ok(input.failurePacket.evidence?.artifacts?.some((artifact) => artifact.kind === "failure_packet"));
  assertStringArrayIncludes(input.failurePacket.boundaries, "do not autonomously fix", "failure packet must disclose remediation boundary");

  assert.equal(input.scenarioIndex.schema, "realistic-mobile-evidence-breadth/v1");
  assert.equal(input.scenarioIndex.verdict, "realistic_workflow_evidence_available");
  assert.ok((input.scenarioIndex.scenarioCount ?? 0) >= 2, "scenario index must include at least two app-oriented scenarios");
  assert.ok((input.scenarioIndex.failurePacketCount ?? 0) >= 1, "scenario index must include at least one failure packet");
  assert.ok(input.scenarioIndex.scenarios?.some((scenario) => scenario.surface === "react_native_android"));
  assert.ok(input.scenarioIndex.scenarios?.some((scenario) => Boolean(scenario.failurePacketPath)));
  assertStringArrayIncludes(input.scenarioIndex.boundaries, "Dry-run or fixture", "scenario index must disclose dry-run fixture boundary");

  assert.match(input.reportMarkdown, /## Mobile change verification/);
  assert.match(input.reportMarkdown, /Validation surface:/);
  assert.match(input.reportMarkdown, /Next action:/);
  assert.match(input.failureMarkdown, /## Mobile verification failure packet/);
  assert.match(input.failureMarkdown, /Category: `network`/);
  assert.match(input.scenarioMarkdown, /## Realistic mobile evidence breadth/);
  assert.match(input.scenarioMarkdown, /react_native_android/);
}

export async function validateMobileChangeVerificationEvidence(): Promise<void> {
  validateMobileChangeVerificationEvidenceShape({
    bundle: await readJson(summaryJsonPath),
    failurePacket: await readJson(failurePacketJsonPath),
    scenarioIndex: await readJson(scenarioIndexJsonPath),
    reportMarkdown: await readFile(path.join(repoRoot(), reportMarkdownPath), "utf8"),
    failureMarkdown: await readFile(path.join(repoRoot(), failurePacketMarkdownPath), "utf8"),
    scenarioMarkdown: await readFile(path.join(repoRoot(), scenarioIndexMarkdownPath), "utf8"),
  });
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeVerificationEvidence().then(() => {
    console.log("Mobile change verification evidence validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
