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
  dataSummary?: Record<string, unknown>;
}

interface LiveProof {
  runId: string;
  generatedAt: string;
  platform: "android";
  runnerProfile: string;
  appId: string;
  deviceId?: string;
  sessionId?: string;
  policyProfile: string;
  verdict: "live_governed_control_observed" | "device_unavailable" | "proof_inconclusive";
  steps: ProofStep[];
  artifacts: string[];
  inspectedScreen: boolean;
  policyDenied: boolean;
  remediationAvailable: boolean;
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function summarizeResult(
  name: string,
  result: unknown,
  summary: string,
  dataSummary?: Record<string, unknown>,
): ProofStep {
  const record = asRecord(result);
  return {
    name,
    status: typeof record.status === "string" ? record.status : "unknown",
    reasonCode: typeof record.reasonCode === "string" ? record.reasonCode : undefined,
    artifacts: asStringArray(record.artifacts),
    summary,
    dataSummary,
  };
}

function summarizeInspect(result: unknown): Record<string, unknown> {
  const data = asRecord(asRecord(result).data);
  const summary = asRecord(data.summary);
  return {
    outputPath: typeof data.outputPath === "string" ? data.outputPath : undefined,
    contentLength: typeof data.content === "string" ? data.content.length : undefined,
    totalNodes: summary.totalNodes,
    clickableNodes: summary.clickableNodes,
  };
}

function summarizeScreen(result: unknown): Record<string, unknown> {
  const data = asRecord(asRecord(result).data);
  const screenSummary = asRecord(data.screenSummary);
  return {
    appPhase: screenSummary.appPhase,
    readiness: screenSummary.readiness,
    stateConfidence: screenSummary.stateConfidence,
    summarySource: data.summarySource,
  };
}

function selectAndroidDevice(listDevicesResult: unknown): string | undefined {
  const requested = process.env.M2E_DEVICE_ID;
  if (requested && requested.length > 0) {
    return requested;
  }

  const data = asRecord(asRecord(listDevicesResult).data);
  const android = Array.isArray(data.android) ? data.android : [];
  for (const item of android) {
    const device = asRecord(item);
    if (device.available === false) {
      continue;
    }
    if (typeof device.id === "string" && device.id.length > 0) {
      return device.id;
    }
  }
  return undefined;
}

function buildVerdict(params: {
  deviceId?: string;
  inspectedScreen: boolean;
  policyDenied: boolean;
  remediationAvailable: boolean;
}): LiveProof["verdict"] {
  if (!params.deviceId) {
    return "device_unavailable";
  }
  return params.inspectedScreen && params.policyDenied && params.remediationAvailable
    ? "live_governed_control_observed"
    : "proof_inconclusive";
}

function renderMarkdown(proof: LiveProof): string {
  const lines = [
    "# Governed Agent Mobile Control Live Proof",
    "",
    `- Run ID: ${proof.runId}`,
    `- Generated at: ${proof.generatedAt}`,
    `- Platform: ${proof.platform}`,
    `- Runner profile: ${proof.runnerProfile}`,
    `- App ID: ${proof.appId}`,
    `- Device ID: ${proof.deviceId ?? "<none>"}`,
    `- Session ID: ${proof.sessionId ?? "<none>"}`,
    `- Policy profile: ${proof.policyProfile}`,
    `- Verdict: ${proof.verdict}`,
    "",
    "## Steps",
    "",
    ...proof.steps.map((step) => [
      `### ${step.name}`,
      "",
      `- Status: ${step.status}`,
      `- Reason code: ${step.reasonCode ?? "<none>"}`,
      `- Summary: ${step.summary}`,
      step.artifacts && step.artifacts.length > 0 ? `- Artifacts: ${step.artifacts.join(", ")}` : "- Artifacts: <none>",
      step.dataSummary ? `- Data summary: \`${JSON.stringify(step.dataSummary)}\`` : undefined,
      "",
    ].filter((line): line is string => Boolean(line)).join("\n")),
    "## Result",
    "",
    proof.verdict === "live_governed_control_observed"
      ? "PASS: the proof observed a real Android UI surface, then enforced a read-only policy boundary and returned governance guidance."
      : proof.verdict === "device_unavailable"
        ? "NOT RUN: no available Android device was detected, so no live UI evidence was captured."
        : "INCONCLUSIVE: an Android device was selected, but not all governed-control evidence checks passed.",
    "",
  ];
  return lines.join("\n");
}

async function runLiveProof(outputDir: string): Promise<LiveProof> {
  const server = createServer();
  const runId = path.basename(outputDir);
  const generatedAt = new Date().toISOString();
  const platform = "android" as const;
  const runnerProfile = process.env.M2E_RUNNER_PROFILE ?? "native_android";
  const appId = process.env.M2E_APP_ID ?? "com.android.settings";
  const policyProfile = "read-only";
  const steps: ProofStep[] = [];

  const listed = await server.invoke("list_devices", { includeUnavailable: true });
  const deviceId = selectAndroidDevice(listed);
  steps.push(summarizeResult(
    "list_devices",
    listed,
    deviceId ? "Selected an available Android device for live governed-control proof." : "No available Android device was detected.",
    { selectedAndroidDeviceId: deviceId ?? null },
  ));

  if (!deviceId) {
    return {
      runId,
      generatedAt,
      platform,
      runnerProfile,
      appId,
      policyProfile,
      verdict: "device_unavailable",
      steps,
      artifacts: [],
      inspectedScreen: false,
      policyDenied: false,
      remediationAvailable: false,
    };
  }

  const sessionId = process.env.M2E_SESSION_ID ?? `governed-agent-live-${Date.now()}`;

  const capabilities = await server.invoke("describe_capabilities", { platform, runnerProfile });
  steps.push(summarizeResult(
    "describe_capabilities",
    capabilities,
    "Expose Android runner support boundaries before live inspection.",
  ));

  const started = await server.invoke("start_session", {
    sessionId,
    platform,
    deviceId,
    appId,
    profile: runnerProfile,
    policyProfile,
  });
  steps.push(summarizeResult(
    "start_session",
    started,
    "Create an auditable read-only live session with device lease and audit artifacts.",
  ));

  const inspectOutputPath = path.join(outputDir, "inspect-ui.xml");
  const inspected = await server.invoke("inspect_ui", {
    sessionId,
    platform,
    deviceId,
    runnerProfile,
    outputPath: inspectOutputPath,
  });
  steps.push(summarizeResult(
    "inspect_ui",
    inspected,
    "Capture the current Android UI hierarchy as live read-only evidence.",
    summarizeInspect(inspected),
  ));

  const screen = await server.invoke("get_screen_summary", {
    sessionId,
    platform,
    deviceId,
    runnerProfile,
    includeDebugSignals: true,
  });
  steps.push(summarizeResult(
    "get_screen_summary",
    screen,
    "Summarize the live screen state before attempting any interactive action.",
    summarizeScreen(screen),
  ));

  const denied = await server.invoke("perform_action_with_evidence", {
    sessionId,
    platform,
    deviceId,
    runnerProfile,
    action: {
      actionType: "tap_element",
      text: "Settings",
    },
  });
  steps.push(summarizeResult(
    "perform_action_with_evidence",
    denied,
    "Attempt an interactive action under read-only policy; expected result is structured policy denial.",
  ));

  const remediation = await server.invoke("suggest_known_remediation", {
    sessionId,
    platform,
  });
  steps.push(summarizeResult(
    "suggest_known_remediation",
    remediation,
    "Ask for governance-specific next steps after policy denial.",
  ));

  const ended = await server.invoke("end_session", {
    sessionId,
    artifacts: [path.relative(repoRoot(), outputDir)],
  });
  steps.push(summarizeResult(
    "end_session",
    ended,
    "Close the governed live session and preserve proof artifact references.",
  ));

  const inspectedScreen = asRecord(inspected).status === "success";
  const policyDenied = asRecord(denied).reasonCode === "POLICY_DENIED";
  const remediationAvailable = asRecord(remediation).reasonCode === "OK";
  return {
    runId,
    generatedAt,
    platform,
    runnerProfile,
    appId,
    deviceId,
    sessionId,
    policyProfile,
    verdict: buildVerdict({ deviceId, inspectedScreen, policyDenied, remediationAvailable }),
    steps,
    artifacts: [...new Set(steps.flatMap((step) => step.artifacts ?? []))],
    inspectedScreen,
    policyDenied,
    remediationAvailable,
  };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const runId = process.env.M2E_GOVERNED_AGENT_LIVE_PROOF_RUN_ID ?? timestampId();
  const outputDir = path.resolve(root, "output/showcase/governed-agent-mobile-control-live", runId);
  await mkdir(outputDir, { recursive: true });

  const proof = await runLiveProof(outputDir);

  await writeFile(path.join(outputDir, "live-proof.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMarkdown(proof), "utf8");

  if (proof.deviceId) {
    assert.equal(proof.inspectedScreen, true, "live proof should capture inspect_ui evidence when a device is available");
    assert.equal(proof.policyDenied, true, "live proof should observe POLICY_DENIED under read-only policy");
    assert.equal(proof.remediationAvailable, true, "live proof should return governance guidance after policy denial");
  }

  console.log(`Governed agent mobile control live proof written to ${path.relative(root, outputDir)}`);
  console.log(JSON.stringify({
    runId,
    outputDir: path.relative(root, outputDir),
    deviceId: proof.deviceId ?? null,
    sessionId: proof.sessionId ?? null,
    verdict: proof.verdict,
    inspectedScreen: proof.inspectedScreen,
    policyDenied: proof.policyDenied,
    remediationAvailable: proof.remediationAvailable,
  }, null, 2));

  if (proof.verdict === "device_unavailable" && process.env.M2E_LIVE_PROOF_ALLOW_NO_DEVICE !== "1") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
