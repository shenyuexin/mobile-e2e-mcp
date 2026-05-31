import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type OfficialToolBridgeRole =
  | "upstream_android_journey_executor"
  | "ide_android_journey_authoring"
  | "framework_project_context_provider";

export interface OfficialToolBridgeEntry {
  id: "android_cli_journeys" | "android_studio_journeys" | "dart_flutter_mcp";
  name: string;
  officialSource: string;
  provider: "android" | "flutter";
  role: OfficialToolBridgeRole;
  relationToMobileE2E: "upstream_evidence_provider" | "upstream_context_provider";
  acceptedEvidenceKinds: string[];
  requiredIntakeChecks: string[];
  cannotClaim: string[];
  recommendedUse: string;
}

export interface OfficialToolBridge {
  schema: "official-tool-bridge/v1";
  generatedAt: string;
  positioning: {
    mobileE2ERole: string;
    officialToolRole: string;
    replacementClaim: false;
  };
  entries: OfficialToolBridgeEntry[];
  bridgeRules: string[];
}

const outputDir = "docs/showcase/evidence/official-tool-bridge";
const bridgeJsonPath = `${outputDir}/bridge.json`;
const bridgeMarkdownPath = `${outputDir}/bridge.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function buildOfficialToolBridge(): OfficialToolBridge {
  return {
    schema: "official-tool-bridge/v1",
    generatedAt: "2026-06-01",
    positioning: {
      mobileE2ERole: "Governed cross-stack mobile verification harness: policy, session, evidence, intake, failure memory, and PR/CI proof boundaries.",
      officialToolRole: "Source-native AI tooling that can author journeys, provide project context, or produce upstream execution evidence.",
      replacementClaim: false,
    },
    entries: [
      {
        id: "android_cli_journeys",
        name: "Android CLI support for Journeys",
        officialSource: "https://developer.android.com/tools/agents/android-cli/journeys",
        provider: "android",
        role: "upstream_android_journey_executor",
        relationToMobileE2E: "upstream_evidence_provider",
        acceptedEvidenceKinds: ["journey_definition", "journey_run_result", "device_screenshot", "assertion_result"],
        requiredIntakeChecks: [
          "source identifies target app and device",
          "run result distinguishes completed, failed, and blocked",
          "screenshots/assertions are linked as artifacts",
          "mobile-e2e proof level remains governed by harness intake",
        ],
        cannotClaim: [
          "standalone_cross_stack_success",
          "react_native_or_flutter_profile_maturity",
          "policy_session_audit_coverage_inside_this_harness",
        ],
        recommendedUse: "Use as an Android-native upstream journey runner; ingest outputs as evidence candidates, not as automatic mobile-e2e success proof.",
      },
      {
        id: "android_studio_journeys",
        name: "Journeys for Android Studio",
        officialSource: "https://developer.android.com/studio/gemini/journeys",
        provider: "android",
        role: "ide_android_journey_authoring",
        relationToMobileE2E: "upstream_evidence_provider",
        acceptedEvidenceKinds: ["journey_xml", "ide_run_result", "reasoning_trace", "assertion_result"],
        requiredIntakeChecks: [
          "journey file and run output are preserved",
          "device/app configuration is visible",
          "AI-evaluated assertions are labeled as visual/reasoning evidence",
          "harness result keeps deterministic and visual evidence boundaries separate",
        ],
        cannotClaim: [
          "standalone_cross_stack_success",
          "non_android_platform_coverage",
          "harness_policy_compliance_without_intake",
        ],
        recommendedUse: "Use for Android IDE journey authoring and exploratory AI testing; treat run output as upstream evidence requiring harness intake.",
      },
      {
        id: "dart_flutter_mcp",
        name: "Dart and Flutter MCP server",
        officialSource: "https://docs.flutter.dev/ai/mcp-server",
        provider: "flutter",
        role: "framework_project_context_provider",
        relationToMobileE2E: "upstream_context_provider",
        acceptedEvidenceKinds: ["runtime_error", "widget_tree_context", "static_analysis_issue", "dependency_action"],
        requiredIntakeChecks: [
          "framework context is linked to a specific app run or code change",
          "runtime/widget evidence is labeled as Flutter context rather than device E2E proof",
          "mobile-e2e verification still supplies device/session/proof-level outcome",
          "dependency or code actions remain separate from evidence promotion",
        ],
        cannotClaim: [
          "standalone_device_e2e_success",
          "android_or_ios_policy_session_coverage",
          "react_native_support",
        ],
        recommendedUse: "Use as Flutter project intelligence and runtime context for agents; combine with mobile-e2e device evidence for proof.",
      },
    ],
    bridgeRules: [
      "Official-tool outputs are accepted only as evidence or context candidates until mobile-e2e intake assigns proof level.",
      "Vision/reasoning assertions must be labeled separately from deterministic readiness or native post-condition checks.",
      "No official-tool bridge entry may claim to replace the harness policy, session, evidence, and failure-memory layer.",
    ],
  };
}

export function validateOfficialToolBridge(bridge: OfficialToolBridge): void {
  assert.equal(bridge.schema, "official-tool-bridge/v1");
  assert.equal(bridge.positioning.replacementClaim, false, "official tool bridge must not claim replacement");
  assert.equal(bridge.entries.length, 3, "bridge must cover Android CLI Journeys, Android Studio Journeys, and Dart/Flutter MCP");
  for (const entry of bridge.entries) {
    assert.ok(entry.officialSource.startsWith("https://"), `${entry.id} must include an official source URL`);
    assert.ok(entry.acceptedEvidenceKinds.length > 0, `${entry.id} must define accepted evidence kinds`);
    assert.ok(entry.requiredIntakeChecks.length > 0, `${entry.id} must define intake checks`);
    assert.ok(entry.cannotClaim.length > 0, `${entry.id} must define cannot-claim boundaries`);
    assert.ok(entry.cannotClaim.some((claim) => claim.includes("standalone") || claim.includes("harness")), `${entry.id} must reject standalone or harness replacement claims`);
  }
  assert.ok(bridge.bridgeRules.some((rule) => rule.includes("proof level")), "bridge rules must mention proof-level intake");
}

export function renderOfficialToolBridgeMarkdown(bridge: OfficialToolBridge): string {
  const entryBlocks = bridge.entries.flatMap((entry) => [
    `### ${entry.name}`,
    "",
    `- ID: \`${entry.id}\``,
    `- Source: ${entry.officialSource}`,
    `- Role: \`${entry.role}\``,
    `- Relation: \`${entry.relationToMobileE2E}\``,
    `- Accepted evidence: ${entry.acceptedEvidenceKinds.map((kind) => `\`${kind}\``).join(", ")}`,
    `- Cannot claim: ${entry.cannotClaim.map((claim) => `\`${claim}\``).join(", ")}`,
    `- Recommended use: ${entry.recommendedUse}`,
    "",
  ]);

  return [
    "## Official Tool Bridge",
    "",
    `Generated at: \`${bridge.generatedAt}\``,
    "",
    "Positioning:",
    `- Mobile E2E MCP: ${bridge.positioning.mobileE2ERole}`,
    `- Official tools: ${bridge.positioning.officialToolRole}`,
    `- Replacement claim: \`${String(bridge.positioning.replacementClaim)}\``,
    "",
    "Bridge rules:",
    ...bridge.bridgeRules.map((rule) => `- ${rule}`),
    "",
    ...entryBlocks,
  ].join("\n");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:official-tool-bridge`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeOfficialToolBridge(check: boolean): Promise<OfficialToolBridge> {
  const bridge = buildOfficialToolBridge();
  validateOfficialToolBridge(bridge);
  await writeOrCheck(bridgeJsonPath, `${JSON.stringify(bridge, null, 2)}\n`, check);
  await writeOrCheck(bridgeMarkdownPath, renderOfficialToolBridgeMarkdown(bridge), check);
  return bridge;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const bridge = await writeOfficialToolBridge(check);
  console.log(check ? "Official tool bridge is up to date." : `Official tool bridge written to ${outputDir}`);
  console.log(JSON.stringify({
    entries: bridge.entries.map((entry) => entry.id),
    replacementClaim: bridge.positioning.replacementClaim,
  }, null, 2));
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
