import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type FailureCategory = "environment" | "policy" | "app_readiness" | "network" | "ui_target" | "app_crash" | "interruption" | "keyboard_focus" | "unknown";
type FailureConfidence = "high" | "medium" | "low";

export interface MobileChangeFailureMemoryRecord {
  sourcePath: string;
  category: FailureCategory;
  reasonCode: string;
  confidence: FailureConfidence;
  evidencePaths: string[];
}

export interface MobileChangeFailureMemoryRecommendation {
  kind:
    | "run_device_readiness_doctor"
    | "request_policy_escalation"
    | "repair_readiness_contract"
    | "inspect_network_policy"
    | "refine_selector_or_wait"
    | "inspect_crash_signals"
    | "resolve_interruption"
    | "inspect_keyboard_focus"
    | "collect_debug_evidence";
  command: string;
  reason: string;
  bounded: true;
}

export interface MobileChangeFailureMemoryPattern {
  key: string;
  category: FailureCategory;
  reasonCode: string;
  occurrences: number;
  confidence: FailureConfidence;
  sourcePaths: string[];
  evidencePaths: string[];
  recommendation: MobileChangeFailureMemoryRecommendation;
}

export interface MobileChangeFailureMemory {
  schema: "mobile-change-failure-memory/v1";
  runId: string;
  totalRecords: number;
  patterns: MobileChangeFailureMemoryPattern[];
  boundaries: string[];
}

export interface MobileChangeFailureMemoryValidation {
  ok: boolean;
  patternCount: number;
}

interface FailurePacketArtifact {
  path?: string;
}

interface FailurePacket {
  category?: FailureCategory;
  reasonCode?: string;
  confidence?: FailureConfidence;
  evidence?: {
    artifacts?: FailurePacketArtifact[];
  };
}

interface RepoAppCandidate {
  blockers?: Array<{
    reasonCode?: string;
    detail?: string;
  }>;
  verification?: {
    evidence?: Record<string, string | undefined>;
  };
}

const defaultRunId = "mobile-change-failure-memory-2026-05-31";
const defaultOutputDir = "docs/showcase/evidence/mobile-change-failure-memory";
const defaultFailurePacketPaths = [
  "docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json",
  "docs/showcase/evidence/mobile-change-live-android-10AEA40Z3Y000R5/failure-packet.json",
  "docs/showcase/evidence/mobile-change-verification-fixture/failure-packet.json",
];
const defaultCandidatePath = "docs/showcase/evidence/mobile-change-repo-app-success-candidate/candidate.json";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

function memoryBoundaries(): string[] {
  return [
    "Failure memory groups observed evidence; it is not a root-cause oracle.",
    "Recommendations are bounded next actions and must not autonomously edit app or test code.",
    "Low-confidence or unknown patterns route to inspect-first evidence collection.",
  ];
}

function confidenceRank(confidence: FailureConfidence): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function lowestConfidence(values: FailureConfidence[]): FailureConfidence {
  return values.reduce((lowest, current) => confidenceRank(current) < confidenceRank(lowest) ? current : lowest, "high" as FailureConfidence);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function recommendationFor(input: {
  category: FailureCategory;
  reasonCode: string;
  confidence: FailureConfidence;
}): MobileChangeFailureMemoryRecommendation {
  if (input.confidence === "low" || input.category === "unknown") {
    return {
      kind: "collect_debug_evidence",
      command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
      reason: "The evidence is weak or unknown; collect a fresh verification bundle before assigning cause.",
      bounded: true,
    };
  }
  switch (input.category) {
    case "environment":
      return {
        kind: "run_device_readiness_doctor",
        command: "pnpm run generate:mobile-change-device-readiness && pnpm run validate:mobile-change-device-readiness",
        reason: "Environment blockers should be diagnosed before retrying UI-affecting live actions.",
        bounded: true,
      };
    case "policy":
      return {
        kind: "request_policy_escalation",
        command: "pnpm run proof:governed-policy-escalation",
        reason: "Policy-denied actions require an explicit policy-profile transition before retry.",
        bounded: true,
      };
    case "app_readiness":
      return {
        kind: "repair_readiness_contract",
        command: "pnpm run validate:mobile-change-readiness-contract && pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Repeated app-readiness failures should be resolved by verifying deterministic readiness signals before another live proof.",
        bounded: true,
      };
    case "network":
      return {
        kind: "inspect_network_policy",
        command: "pnpm run validate:mobile-change-verification",
        reason: "Network failures should be checked against static release policy and observed request evidence before retry.",
        bounded: true,
      };
    case "ui_target":
      return {
        kind: "refine_selector_or_wait",
        command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Selector failures should refine stable IDs or add a bounded wait before retry.",
        bounded: true,
      };
    case "app_crash":
      return {
        kind: "inspect_crash_signals",
        command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Crash-like failures require logs and crash signals before replaying actions.",
        bounded: true,
      };
    case "interruption":
      return {
        kind: "resolve_interruption",
        command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Interruption failures should be resolved through the governed interruption path before retry.",
        bounded: true,
      };
    case "keyboard_focus":
      return {
        kind: "inspect_keyboard_focus",
        command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Keyboard focus failures require focus and IME evidence before typing again.",
        bounded: true,
      };
    case "unknown":
      return {
        kind: "collect_debug_evidence",
        command: "pnpm run verify:mobile-change -- --live --contract=configs/readiness/demo-android-app.android.json",
        reason: "Unknown failures require additional evidence before assigning cause.",
        bounded: true,
      };
  }
}

export function buildMobileChangeFailureMemory(input: {
  runId: string;
  records: MobileChangeFailureMemoryRecord[];
}): MobileChangeFailureMemory {
  const groups = new Map<string, MobileChangeFailureMemoryRecord[]>();
  for (const record of input.records) {
    const key = record.category === "app_readiness" ? "app_readiness:*" : `${record.category}:${record.reasonCode}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const patterns = [...groups.entries()].map(([key, records]) => {
    const confidence = lowestConfidence(records.map((record) => record.confidence));
    const category = records[0]?.category ?? "unknown";
    const reasonCode = records[0]?.reasonCode ?? "UNKNOWN";
    return {
      key,
      category,
      reasonCode,
      occurrences: records.length,
      confidence,
      sourcePaths: unique(records.map((record) => record.sourcePath)),
      evidencePaths: unique(records.flatMap((record) => record.evidencePaths)),
      recommendation: recommendationFor({ category, reasonCode, confidence }),
    };
  });

  return {
    schema: "mobile-change-failure-memory/v1",
    runId: input.runId,
    totalRecords: input.records.length,
    patterns,
    boundaries: memoryBoundaries(),
  };
}

export function validateMobileChangeFailureMemory(memory: MobileChangeFailureMemory): MobileChangeFailureMemoryValidation {
  assert.equal(memory.schema, "mobile-change-failure-memory/v1");
  assert.equal(memory.totalRecords >= memory.patterns.length, true, "total records must be at least pattern count");
  for (const pattern of memory.patterns) {
    assert.ok(pattern.key.includes(":"), "pattern key must include category and reason code");
    assert.ok(pattern.occurrences > 0, "pattern occurrences must be positive");
    assert.equal(pattern.recommendation.bounded, true, "recommendations must be bounded");
    if (pattern.confidence === "high") {
      assert.ok(pattern.evidencePaths.length > 0, "high-confidence patterns require evidence paths");
    }
    if (pattern.confidence === "low" || pattern.category === "unknown") {
      assert.equal(pattern.recommendation.kind, "collect_debug_evidence", "weak evidence must collect evidence first");
    }
  }
  return { ok: true, patternCount: memory.patterns.length };
}

export function recordFromFailurePacket(input: {
  sourcePath: string;
  packet: FailurePacket;
}): MobileChangeFailureMemoryRecord {
  return {
    sourcePath: input.sourcePath,
    category: input.packet.category ?? "unknown",
    reasonCode: input.packet.reasonCode ?? "UNKNOWN",
    confidence: input.packet.confidence ?? "low",
    evidencePaths: unique([
      input.sourcePath,
      ...((input.packet.evidence?.artifacts ?? []).map((artifact) => artifact.path ?? "")),
    ]),
  };
}

export function recordsFromRepoAppCandidate(input: {
  sourcePath: string;
  candidate: RepoAppCandidate;
}): MobileChangeFailureMemoryRecord[] {
  const readinessEvidence = Object.values(input.candidate.verification?.evidence ?? {}).filter((value): value is string => typeof value === "string");
  return (input.candidate.blockers ?? []).map((blocker) => ({
    sourcePath: input.sourcePath,
    category: "environment",
    reasonCode: blocker.reasonCode ?? "UNKNOWN",
    confidence: "high",
    evidencePaths: unique([input.sourcePath, ...readinessEvidence]),
  }));
}

export function renderMobileChangeFailureMemoryMarkdown(memory: MobileChangeFailureMemory): string {
  const patternLines = memory.patterns.flatMap((pattern) => [
    `- ${pattern.key}: occurrences \`${pattern.occurrences}\`, confidence \`${pattern.confidence}\``,
    `  - Recommendation: \`${pattern.recommendation.kind}\` - ${pattern.recommendation.reason}`,
    `  - Command: \`${pattern.recommendation.command}\``,
    `  - Evidence: ${pattern.evidencePaths.length > 0 ? pattern.evidencePaths.map((item) => `\`${item}\``).join(", ") : "`not-collected`"}`,
  ]);
  return [
    "## Mobile Change Failure Memory",
    "",
    `Run ID: \`${memory.runId}\``,
    `Total records: \`${memory.totalRecords}\``,
    `Pattern count: \`${memory.patterns.length}\``,
    "",
    "Patterns:",
    ...patternLines,
    "",
    "Boundaries:",
    ...memory.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
}

async function buildDefaultMemory(runId: string): Promise<MobileChangeFailureMemory> {
  const failureRecords = await Promise.all(defaultFailurePacketPaths.map(async (sourcePath) => recordFromFailurePacket({
    sourcePath,
    packet: await readJson<FailurePacket>(sourcePath),
  })));
  const candidate = await readJson<RepoAppCandidate>(defaultCandidatePath);
  return buildMobileChangeFailureMemory({
    runId,
    records: [
      ...failureRecords,
      ...recordsFromRepoAppCandidate({
        sourcePath: defaultCandidatePath,
        candidate,
      }),
    ],
  });
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-failure-memory`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function writeMemory(input: {
  outputDir: string;
  memory: MobileChangeFailureMemory;
  check: boolean;
}): Promise<void> {
  validateMobileChangeFailureMemory(input.memory);
  await writeOrCheck(`${input.outputDir}/summary.json`, `${JSON.stringify(input.memory, null, 2)}\n`, input.check);
  await writeOrCheck(`${input.outputDir}/remediation.md`, renderMobileChangeFailureMemoryMarkdown(input.memory), input.check);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const runIdArg = process.argv.find((arg) => arg.startsWith("--run-id="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output-dir="));
  const outputDir = outputArg?.slice("--output-dir=".length) ?? defaultOutputDir;
  const memory = await buildDefaultMemory(runIdArg?.slice("--run-id=".length) ?? defaultRunId);
  const validation = validateMobileChangeFailureMemory(memory);
  await writeMemory({ outputDir, memory, check });
  console.log(JSON.stringify({
    patternCount: validation.patternCount,
    outputDir,
    recommendations: memory.patterns.map((pattern) => pattern.recommendation.kind),
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
