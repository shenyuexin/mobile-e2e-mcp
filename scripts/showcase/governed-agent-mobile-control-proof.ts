import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../../packages/mcp-server/src/index.ts";

interface ProofStep {
  name: string;
  status: string;
  reasonCode?: string;
  artifacts?: string[];
  summary: string;
}

interface BaselineWrapperProof {
  name: string;
  model: string;
  simulatedCommand: string[];
  strengths: string[];
  missingGovernance: string[];
  artifacts: string[];
}

interface HarnessProof {
  sessionId: string;
  policyProfile: string;
  steps: ProofStep[];
  artifacts: string[];
  policyDenied: boolean;
  residualGaps: string[];
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function summarizeResult(name: string, result: unknown, summary: string): ProofStep {
  const record = asRecord(result);
  const artifacts = Array.isArray(record.artifacts)
    ? record.artifacts.filter((item): item is string => typeof item === "string")
    : [];
  return {
    name,
    status: typeof record.status === "string" ? record.status : "unknown",
    reasonCode: typeof record.reasonCode === "string" ? record.reasonCode : undefined,
    artifacts,
    summary,
  };
}

function buildBaselineWrapperProof(): BaselineWrapperProof {
  return {
    name: "custom-adb-wrapper-baseline",
    model: "A minimal internal MCP wrapper exposes an allowlisted adb tap command plus command logging.",
    simulatedCommand: ["adb", "-s", "proof-device", "shell", "input", "tap", "540", "1280"],
    strengths: [
      "Fast to build for a narrow internal demo.",
      "Can allowlist a few commands and record stdout/stderr.",
      "Can capture a screenshot or log file if the wrapper author adds that behavior.",
    ],
    missingGovernance: [
      "No first-class session lease or persisted action timeline.",
      "No structured policy denial result tied to the requested tool.",
      "No shared support-boundary reporting for the agent.",
      "No deterministic-first target resolution or fallback disclosure.",
      "No standardized evidence/remediation contract for downstream agents.",
    ],
    artifacts: ["baseline-wrapper.json"],
  };
}

async function runHarnessProof(outputDir: string): Promise<HarnessProof> {
  const server = createServer();
  const sessionId = `governed-agent-proof-${Date.now()}`;
  const policyProfile = "read-only";
  const steps: ProofStep[] = [];

  const capabilities = await server.invoke("describe_capabilities", {
    platform: "android",
    runnerProfile: "phase1",
  });
  steps.push(summarizeResult(
    "describe_capabilities",
    capabilities,
    "Expose platform and runner support boundaries before an agent acts.",
  ));

  const start = await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId: "proof-device",
    profile: "phase1",
    policyProfile,
  });
  steps.push(summarizeResult(
    "start_session",
    start,
    "Create an auditable read-only session with persisted session/audit artifacts.",
  ));

  const deniedAction = await server.invoke("perform_action_with_evidence", {
    sessionId,
    platform: "android",
    deviceId: "proof-device",
    runnerProfile: "phase1",
    dryRun: true,
    action: {
      actionType: "tap_element",
      contentDesc: "Settings",
    },
  });
  steps.push(summarizeResult(
    "perform_action_with_evidence",
    deniedAction,
    "Attempt an interactive action under read-only policy; expected result is structured policy denial.",
  ));

  const remediation = await server.invoke("suggest_known_remediation", {
    sessionId,
    platform: "android",
    runnerProfile: "phase1",
    dryRun: true,
  });
  steps.push(summarizeResult(
    "suggest_known_remediation",
    remediation,
    "Ask for agent-consumable next-action guidance after the policy-governed attempt.",
  ));

  const end = await server.invoke("end_session", {
    sessionId,
    artifacts: [path.relative(repoRoot(), outputDir)],
  });
  steps.push(summarizeResult(
    "end_session",
    end,
    "Close the governed session and preserve proof artifact references.",
  ));

  const allArtifacts = [...new Set(steps.flatMap((step) => step.artifacts ?? []))];
  const deniedRecord = asRecord(deniedAction);
  const remediationRecord = asRecord(remediation);
  const residualGaps = remediationRecord.reasonCode === "OK"
    ? []
    : [
      "Policy-denied attempts are not yet converted into a standard failure record for suggest_known_remediation.",
      "Agent next-action guidance after policy denial should be modeled as a governance follow-up, not a generic failure-remediation path.",
    ];
  return {
    sessionId,
    policyProfile,
    steps,
    artifacts: allArtifacts,
    policyDenied: deniedRecord.reasonCode === "POLICY_DENIED",
    residualGaps,
  };
}

function buildComparison(baseline: BaselineWrapperProof, harness: HarnessProof) {
  return {
    verdict: harness.policyDenied ? "governed_harness_shows_distinct_value" : "proof_inconclusive",
    baselineSummary: "The custom wrapper can log a command, but governance semantics are convention-based.",
    harnessSummary: "The harness returns a structured policy denial inside an auditable session and preserves artifacts.",
    differentiators: [
      "Policy denial is a machine-readable tool result, not a log convention.",
      "Session start/end produce persisted evidence references.",
      "Capabilities are queried before action, so support boundaries are explicit.",
      "Governance-denial guidance is available as a structured tool result for downstream agent planning.",
    ],
    baselineMissingGovernance: baseline.missingGovernance,
    harnessPolicyDenied: harness.policyDenied,
    residualGaps: harness.residualGaps,
  };
}

function renderMarkdown(params: {
  runId: string;
  generatedAt: string;
  baseline: BaselineWrapperProof;
  harness: HarnessProof;
  comparison: ReturnType<typeof buildComparison>;
}): string {
  const lines = [
    "# Governed Agent Mobile Control Proof",
    "",
    `- Run ID: ${params.runId}`,
    `- Generated at: ${params.generatedAt}`,
    `- Session ID: ${params.harness.sessionId}`,
    `- Policy profile: ${params.harness.policyProfile}`,
    `- Verdict: ${params.comparison.verdict}`,
    "",
    "## Baseline: Custom Wrapper",
    "",
    params.baseline.model,
    "",
    `Simulated command: \`${params.baseline.simulatedCommand.join(" ")}\``,
    "",
    "Strengths:",
    ...params.baseline.strengths.map((item) => `- ${item}`),
    "",
    "Missing governance:",
    ...params.baseline.missingGovernance.map((item) => `- ${item}`),
    "",
    "## Harness Run",
    "",
    ...params.harness.steps.map((step) => [
      `### ${step.name}`,
      "",
      `- Status: ${step.status}`,
      `- Reason code: ${step.reasonCode ?? "<none>"}`,
      `- Summary: ${step.summary}`,
      step.artifacts && step.artifacts.length > 0 ? `- Artifacts: ${step.artifacts.join(", ")}` : "- Artifacts: <none>",
      "",
    ].join("\n")),
    "## Comparison",
    "",
    `Baseline: ${params.comparison.baselineSummary}`,
    "",
    `Harness: ${params.comparison.harnessSummary}`,
    "",
    "Differentiators:",
    ...params.comparison.differentiators.map((item) => `- ${item}`),
    "",
    "Residual gaps:",
    ...(params.comparison.residualGaps.length > 0
      ? params.comparison.residualGaps.map((item) => `- ${item}`)
      : ["- <none>"]),
    "",
    "## Result",
    "",
    params.harness.policyDenied
      ? "PASS: the proof demonstrates a machine-readable policy boundary for an agent-requested mobile action."
      : "INCONCLUSIVE: the expected policy denial was not observed.",
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const root = repoRoot();
  const runId = process.env.M2E_GOVERNED_AGENT_PROOF_RUN_ID ?? timestampId();
  const outputDir = path.resolve(root, "output/showcase/governed-agent-mobile-control", runId);
  await mkdir(outputDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const baseline = buildBaselineWrapperProof();
  const harness = await runHarnessProof(outputDir);
  const comparison = buildComparison(baseline, harness);

  assert.equal(harness.policyDenied, true, "governed harness proof should observe POLICY_DENIED under read-only policy");

  await writeFile(path.join(outputDir, "baseline-wrapper.json"), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "harness-run.json"), `${JSON.stringify(harness, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMarkdown({ runId, generatedAt, baseline, harness, comparison }), "utf8");

  console.log(`Governed agent mobile control proof written to ${path.relative(root, outputDir)}`);
  console.log(JSON.stringify({
    runId,
    outputDir: path.relative(root, outputDir),
    sessionId: harness.sessionId,
    verdict: comparison.verdict,
    policyDenied: harness.policyDenied,
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[governed-agent-proof] ${message}\n`);
  process.exitCode = 1;
});
