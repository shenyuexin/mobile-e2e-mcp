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

interface PolicyEscalationProof {
  runId: string;
  generatedAt: string;
  executionMode: "live" | "dry-run";
  platform: "android";
  runnerProfile: string;
  appId: string;
  deviceId?: string;
  readOnlySessionId?: string;
  interactiveSessionId?: string;
  readOnlyPolicyProfile: string;
  interactivePolicyProfile: string;
  action: {
    actionType: "launch_app";
    targetAppId: string;
    dryRun: boolean;
  };
  verdict: "policy_escalation_retry_observed" | "policy_escalation_retry_dry_run_observed" | "device_unavailable" | "proof_inconclusive";
  steps: ProofStep[];
  artifacts: string[];
  readOnlyDenied: boolean;
  remediationAvailable: boolean;
  interactiveSessionStarted: boolean;
  interactiveRetryAllowed: boolean;
  interactiveRetryExecuted: boolean;
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

function summarizeAction(result: unknown): Record<string, unknown> {
  const record = asRecord(result);
  const data = asRecord(record.data);
  const outcome = asRecord(data.outcome);
  return {
    status: record.status,
    reasonCode: record.reasonCode,
    lowLevelStatus: data.lowLevelStatus,
    lowLevelReasonCode: data.lowLevelReasonCode,
    actionType: outcome.actionType,
    outcome: outcome.outcome,
    stateChanged: outcome.stateChanged,
    fallbackUsed: outcome.fallbackUsed,
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
  readOnlyDenied: boolean;
  remediationAvailable: boolean;
  interactiveSessionStarted: boolean;
  interactiveRetryAllowed: boolean;
  interactiveRetryExecuted: boolean;
}): PolicyEscalationProof["verdict"] {
  if (!params.deviceId) {
    return "device_unavailable";
  }
  const observed = params.readOnlyDenied &&
    params.remediationAvailable &&
    params.interactiveSessionStarted &&
    params.interactiveRetryAllowed &&
    params.interactiveRetryExecuted;
  if (!observed) {
    return "proof_inconclusive";
  }
  return process.env.M2E_POLICY_ESCALATION_DRY_RUN === "1"
    ? "policy_escalation_retry_dry_run_observed"
    : "policy_escalation_retry_observed";
}

function renderMarkdown(proof: PolicyEscalationProof): string {
  const lines = [
    "# Governed Policy Escalation Proof",
    "",
    `- Run ID: ${proof.runId}`,
    `- Generated at: ${proof.generatedAt}`,
    `- Execution mode: ${proof.executionMode}`,
    `- Platform: ${proof.platform}`,
    `- Runner profile: ${proof.runnerProfile}`,
    `- App ID: ${proof.appId}`,
    `- Device ID: ${proof.deviceId ?? "<none>"}`,
    `- Read-only session ID: ${proof.readOnlySessionId ?? "<none>"}`,
    `- Interactive session ID: ${proof.interactiveSessionId ?? "<none>"}`,
    `- Read-only policy profile: ${proof.readOnlyPolicyProfile}`,
    `- Interactive policy profile: ${proof.interactivePolicyProfile}`,
    `- Retried action: ${proof.action.actionType}(${proof.action.targetAppId})`,
    `- Action dry-run: ${proof.action.dryRun}`,
    `- Verdict: ${proof.verdict}`,
    "",
    "## Workflow",
    "",
    "1. Start a read-only session for the target app.",
    "2. Attempt the same side-effecting action the agent wants to perform.",
    "3. Verify the action is blocked with structured `POLICY_DENIED`.",
    "4. Ask for governance remediation guidance.",
    "5. End the read-only session, then start a new `interactive` session.",
    "6. Retry the same action and verify policy no longer blocks it.",
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
    proof.verdict === "policy_escalation_retry_observed"
      ? "PASS: the same agent action was denied under read-only policy, then allowed and executed after an explicit switch to the interactive policy profile."
      : proof.verdict === "policy_escalation_retry_dry_run_observed"
        ? "PASS: dry-run policy mechanics showed the same agent action denied under read-only policy, then allowed through the interactive policy profile without requiring a connected device."
      : proof.verdict === "device_unavailable"
        ? "NOT RUN: no available Android device was detected, so no policy escalation evidence was captured."
        : "INCONCLUSIVE: the workflow ran, but not all escalation evidence checks passed.",
    "",
  ];
  return lines.join("\n");
}

async function runPolicyEscalationProof(outputDir: string): Promise<PolicyEscalationProof> {
  const server = createServer();
  const runId = path.basename(outputDir);
  const generatedAt = new Date().toISOString();
  const executionMode = process.env.M2E_POLICY_ESCALATION_DRY_RUN === "1" ? "dry-run" : "live";
  const platform = "android" as const;
  const runnerProfile = process.env.M2E_RUNNER_PROFILE ?? "native_android";
  const appId = process.env.M2E_POLICY_ESCALATION_APP_ID ?? "com.android.settings";
  const readOnlyPolicyProfile = "read-only";
  const interactivePolicyProfile = "interactive";
  const steps: ProofStep[] = [];

  const listed = await server.invoke("list_devices", { includeUnavailable: true });
  const selectedRealDeviceId = selectAndroidDevice(listed);
  const deviceId = selectedRealDeviceId ?? (executionMode === "dry-run" ? "dry-run-device" : undefined);
  steps.push(summarizeResult(
    "list_devices",
    listed,
    selectedRealDeviceId
      ? "Selected an available Android device for governed policy escalation proof."
      : executionMode === "dry-run"
        ? "No Android device was detected; using the explicit dry-run device placeholder."
        : "No available Android device was detected.",
    {
      selectedAndroidDeviceId: selectedRealDeviceId ?? null,
      dryRunDeviceId: selectedRealDeviceId ? null : deviceId ?? null,
    },
  ));

  if (!deviceId) {
    return {
      runId,
      generatedAt,
      executionMode,
      platform,
      runnerProfile,
      appId,
      readOnlyPolicyProfile,
      interactivePolicyProfile,
      action: { actionType: "launch_app", targetAppId: appId, dryRun: executionMode === "dry-run" },
      verdict: "device_unavailable",
      steps,
      artifacts: [],
      readOnlyDenied: false,
      remediationAvailable: false,
      interactiveSessionStarted: false,
      interactiveRetryAllowed: false,
      interactiveRetryExecuted: false,
    };
  }

  const readOnlySessionId = process.env.M2E_POLICY_ESCALATION_READONLY_SESSION_ID ?? `policy-escalation-readonly-${Date.now()}`;
  const interactiveSessionId = process.env.M2E_POLICY_ESCALATION_INTERACTIVE_SESSION_ID ?? `policy-escalation-interactive-${Date.now()}`;
  const action = {
    actionType: "launch_app" as const,
    appId,
  };

  const capabilities = await server.invoke("describe_capabilities", { platform, runnerProfile });
  steps.push(summarizeResult(
    "describe_capabilities",
    capabilities,
    "Expose Android runner support boundaries before policy escalation proof.",
  ));

  const readOnlyStarted = await server.invoke("start_session", {
    sessionId: readOnlySessionId,
    platform,
    deviceId,
    appId,
    profile: runnerProfile,
    policyProfile: readOnlyPolicyProfile,
  });
  steps.push(summarizeResult(
    "start_read_only_session",
    readOnlyStarted,
    "Create a read-only agent session before the requested side-effecting action.",
  ));

  const denied = await server.invoke("perform_action_with_evidence", {
    sessionId: readOnlySessionId,
    platform,
    deviceId,
    runnerProfile,
    appId,
    dryRun: executionMode === "dry-run",
    action,
  });
  steps.push(summarizeResult(
    "read_only_perform_action_with_evidence",
    denied,
    "Attempt the target action under read-only policy; expected result is structured policy denial.",
    summarizeAction(denied),
  ));

  const remediation = await server.invoke("suggest_known_remediation", {
    sessionId: readOnlySessionId,
    platform,
    runnerProfile,
  });
  steps.push(summarizeResult(
    "suggest_known_remediation",
    remediation,
    "Ask for governance-specific next steps after read-only policy denial.",
  ));

  const readOnlyEnded = await server.invoke("end_session", {
    sessionId: readOnlySessionId,
    artifacts: [path.relative(repoRoot(), outputDir)],
  });
  steps.push(summarizeResult(
    "end_read_only_session",
    readOnlyEnded,
    "Close the read-only session before escalating to a more permissive profile.",
  ));

  const interactiveStarted = await server.invoke("start_session", {
    sessionId: interactiveSessionId,
    platform,
    deviceId,
    appId,
    profile: runnerProfile,
    policyProfile: interactivePolicyProfile,
  });
  steps.push(summarizeResult(
    "start_interactive_session",
    interactiveStarted,
    "Create a new interactive session as the explicit approval boundary for retry.",
  ));

  const retried = await server.invoke("perform_action_with_evidence", {
    sessionId: interactiveSessionId,
    platform,
    deviceId,
    runnerProfile,
    appId,
    dryRun: executionMode === "dry-run",
    action,
  });
  steps.push(summarizeResult(
    "interactive_perform_action_with_evidence",
    retried,
    "Retry the same target action after explicit policy escalation.",
    summarizeAction(retried),
  ));

  const interactiveEnded = await server.invoke("end_session", {
    sessionId: interactiveSessionId,
    artifacts: [path.relative(repoRoot(), outputDir)],
  });
  steps.push(summarizeResult(
    "end_interactive_session",
    interactiveEnded,
    "Close the interactive session and preserve proof artifact references.",
  ));

  const retryRecord = asRecord(retried);
  const retryData = asRecord(retryRecord.data);
  const readOnlyDenied = asRecord(denied).reasonCode === "POLICY_DENIED";
  const remediationAvailable = asRecord(remediation).reasonCode === "OK";
  const interactiveSessionStarted = asRecord(interactiveStarted).status === "success";
  const interactiveRetryAllowed = asRecord(retried).reasonCode !== "POLICY_DENIED" && retryData.lowLevelReasonCode !== "POLICY_DENIED";
  const interactiveRetryExecuted = asRecord(retried).status === "success" && retryData.lowLevelStatus === "success";

  return {
    runId,
    generatedAt,
    executionMode,
    platform,
    runnerProfile,
    appId,
    deviceId,
    readOnlySessionId,
    interactiveSessionId,
    readOnlyPolicyProfile,
    interactivePolicyProfile,
    action: { actionType: "launch_app", targetAppId: appId, dryRun: executionMode === "dry-run" },
    verdict: buildVerdict({
      deviceId,
      readOnlyDenied,
      remediationAvailable,
      interactiveSessionStarted,
      interactiveRetryAllowed,
      interactiveRetryExecuted,
    }),
    steps,
    artifacts: [...new Set(steps.flatMap((step) => step.artifacts ?? []))],
    readOnlyDenied,
    remediationAvailable,
    interactiveSessionStarted,
    interactiveRetryAllowed,
    interactiveRetryExecuted,
  };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const runId = process.env.M2E_POLICY_ESCALATION_PROOF_RUN_ID ?? timestampId();
  const outputDir = path.resolve(root, "output/showcase/governed-policy-escalation", runId);
  await mkdir(outputDir, { recursive: true });

  const proof = await runPolicyEscalationProof(outputDir);

  await writeFile(path.join(outputDir, "policy-escalation-proof.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMarkdown(proof), "utf8");

  if (proof.deviceId) {
    assert.equal(proof.readOnlyDenied, true, "read-only session should deny the side-effecting action");
    assert.equal(proof.remediationAvailable, true, "proof should return governance guidance after denial");
    assert.equal(proof.interactiveSessionStarted, true, "interactive session should start after read-only session closes");
    assert.equal(proof.interactiveRetryAllowed, true, "interactive retry should not be blocked by POLICY_DENIED");
    assert.equal(proof.interactiveRetryExecuted, true, "interactive retry should execute successfully");
  }

  console.log(`Governed policy escalation proof written to ${path.relative(root, outputDir)}`);
  console.log(JSON.stringify({
    runId,
    outputDir: path.relative(root, outputDir),
    executionMode: proof.executionMode,
    deviceId: proof.deviceId ?? null,
    appId: proof.appId,
    verdict: proof.verdict,
    readOnlyDenied: proof.readOnlyDenied,
    remediationAvailable: proof.remediationAvailable,
    interactiveSessionStarted: proof.interactiveSessionStarted,
    interactiveRetryAllowed: proof.interactiveRetryAllowed,
    interactiveRetryExecuted: proof.interactiveRetryExecuted,
  }, null, 2));

  if (proof.verdict === "device_unavailable" && process.env.M2E_POLICY_ESCALATION_ALLOW_NO_DEVICE !== "1") {
    process.exitCode = 1;
  }
  if (proof.verdict === "proof_inconclusive") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
