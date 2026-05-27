import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

interface LiveProofIntakeShape {
  intake: {
    schema?: string;
    verdict?: string;
    proofLevel?: string;
    source?: string;
    verificationVerdict?: string;
    surface?: {
      platform?: string;
      appId?: string;
      policyProfile?: string;
    };
    blockers?: Array<{
      reasonCode?: string;
    }>;
    nextAction?: {
      kind?: string;
    };
    boundaries?: string[];
  };
  markdown: string;
}

const intakeJsonPath = "docs/showcase/evidence/mobile-change-live-proof-intake/intake.json";
const intakeMarkdownPath = "docs/showcase/evidence/mobile-change-live-proof-intake/intake.md";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function includesBoundary(values: string[] | undefined, expected: string): boolean {
  return values?.some((value) => value.includes(expected)) ?? false;
}

export function validateMobileChangeLiveProofIntakeShape(shape: LiveProofIntakeShape): void {
  assert.equal(shape.intake.schema, "mobile-change-live-proof-intake/v1");
  assert.ok(shape.intake.proofLevel === "physical_or_emulator_candidate" || shape.intake.proofLevel === "no_device_or_controlled_output");
  assert.equal(shape.intake.source, "live_device", "intake fixture must stay grounded in live runner output");
  assert.equal(shape.intake.surface?.platform, "android");
  assert.equal(shape.intake.surface?.appId, "com.example.mobilechange");
  assert.equal(shape.intake.surface?.policyProfile, "interactive");
  assert.ok(includesBoundary(shape.intake.boundaries, "without no-device blockers"));

  const blockers = shape.intake.blockers ?? [];
  if (shape.intake.verdict === "promotable_live_proof_candidate") {
    assert.equal(blockers.length, 0, "promotable intake must not include blockers");
    assert.equal(shape.intake.nextAction?.kind, "promote_live_evidence");
    assert.equal(shape.intake.proofLevel, "physical_or_emulator_candidate");
  } else {
    assert.equal(shape.intake.verdict, "not_promotable_live_proof");
    assert.ok(blockers.length > 0, "non-promotable intake must explain the blocker");
    assert.notEqual(shape.intake.nextAction?.kind, "promote_live_evidence");
  }

  assert.match(shape.markdown, /## Mobile change live proof intake/);
  assert.match(shape.markdown, new RegExp(`Verdict: \`${shape.intake.verdict}\``));
}

export async function validateMobileChangeLiveProofIntake(): Promise<void> {
  validateMobileChangeLiveProofIntakeShape({
    intake: await readJson(intakeJsonPath),
    markdown: await readFile(path.join(repoRoot(), intakeMarkdownPath), "utf8"),
  });
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  validateMobileChangeLiveProofIntake().then(() => {
    console.log("Mobile change live proof intake validation passed.");
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
