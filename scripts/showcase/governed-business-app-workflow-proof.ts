import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
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

interface BusinessWorkflowProof {
  runId: string;
  generatedAt: string;
  platform: "android";
  runnerProfile: string;
  appId: string;
  apkPath: string;
  deviceId?: string;
  setupSessionId?: string;
  readOnlySessionId?: string;
  setupPolicyProfile: string;
  readOnlyPolicyProfile: string;
  attemptedBusinessActionText: string;
  verdict: "business_app_governed_workflow_observed" | "device_unavailable" | "app_artifact_unavailable" | "proof_inconclusive";
  steps: ProofStep[];
  artifacts: string[];
  appArtifactAvailable: boolean;
  setupLaunched: boolean;
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

function logStep(name: string): void {
  console.log(`[governed-business-app-workflow] ${name}`);
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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
  appArtifactAvailable: boolean;
  setupLaunched: boolean;
  inspectedScreen: boolean;
  policyDenied: boolean;
  remediationAvailable: boolean;
}): BusinessWorkflowProof["verdict"] {
  if (!params.deviceId) {
    return "device_unavailable";
  }
  if (!params.appArtifactAvailable) {
    return "app_artifact_unavailable";
  }
  return params.setupLaunched && params.inspectedScreen && params.policyDenied && params.remediationAvailable
    ? "business_app_governed_workflow_observed"
    : "proof_inconclusive";
}

function renderMarkdown(proof: BusinessWorkflowProof): string {
  const lines = [
    "# Governed Business App Workflow Proof",
    "",
    `- Run ID: ${proof.runId}`,
    `- Generated at: ${proof.generatedAt}`,
    `- Platform: ${proof.platform}`,
    `- Runner profile: ${proof.runnerProfile}`,
    `- App ID: ${proof.appId}`,
    `- APK path: ${proof.apkPath}`,
    `- Device ID: ${proof.deviceId ?? "<none>"}`,
    `- Setup session ID: ${proof.setupSessionId ?? "<none>"}`,
    `- Read-only session ID: ${proof.readOnlySessionId ?? "<none>"}`,
    `- Setup policy profile: ${proof.setupPolicyProfile}`,
    `- Read-only policy profile: ${proof.readOnlyPolicyProfile}`,
    `- Attempted business action text: ${proof.attemptedBusinessActionText}`,
    `- Verdict: ${proof.verdict}`,
    "",
    "## Workflow",
    "",
    "1. Select an Android device through the MCP device surface.",
    "2. Use a setup session to install and launch the demo business app.",
    "3. Switch to a read-only session for agent observation.",
    "4. Capture live UI evidence.",
    "5. Attempt a business UI action and verify structured policy denial.",
    "6. Ask for governance-specific remediation guidance.",
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
    proof.verdict === "business_app_governed_workflow_observed"
      ? "PASS: the proof observed a real business demo app, then enforced a read-only policy boundary before an agent-requested UI action."
      : proof.verdict === "device_unavailable"
        ? "NOT RUN: no available Android device was detected, so no business-app live evidence was captured."
        : proof.verdict === "app_artifact_unavailable"
          ? "NOT RUN: the configured APK artifact was not found, so the business app could not be installed."
          : "INCONCLUSIVE: the business app workflow ran, but not all governed-control evidence checks passed.",
    "",
  ];
  return lines.join("\n");
}

async function runBusinessWorkflowProof(outputDir: string): Promise<BusinessWorkflowProof> {
  const server = createServer();
  const root = repoRoot();
  const runId = path.basename(outputDir);
  const generatedAt = new Date().toISOString();
  const platform = "android" as const;
  const runnerProfile = process.env.M2E_RUNNER_PROFILE ?? "native_android";
  const appId = process.env.M2E_BUSINESS_APP_ID ?? "com.epam.mobitru";
  const apkPath = path.resolve(
    root,
    process.env.M2E_BUSINESS_APK_PATH ?? "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk",
  );
  const setupPolicyProfile = "sample-harness-default";
  const readOnlyPolicyProfile = "read-only";
  const attemptedBusinessActionText = process.env.M2E_BUSINESS_ACTION_TEXT ?? "Login";
  const skipInstall = process.env.M2E_BUSINESS_SKIP_INSTALL === "1";
  const steps: ProofStep[] = [];

  logStep("list_devices");
  const listed = await server.invoke("list_devices", { includeUnavailable: true });
  const deviceId = selectAndroidDevice(listed);
  steps.push(summarizeResult(
    "list_devices",
    listed,
    deviceId ? "Selected an available Android device for the business-app governed workflow." : "No available Android device was detected.",
    { selectedAndroidDeviceId: deviceId ?? null },
  ));

  logStep("check_app_artifact");
  const appArtifactAvailable = skipInstall ? true : await pathExists(apkPath);
  steps.push({
    name: "check_app_artifact",
    status: appArtifactAvailable ? "success" : "error",
    reasonCode: appArtifactAvailable ? "OK" : "APP_ARTIFACT_UNAVAILABLE",
    summary: skipInstall
      ? "Skipped APK artifact check because M2E_BUSINESS_SKIP_INSTALL=1."
      : appArtifactAvailable
      ? "Found the demo business app APK artifact."
      : "The demo business app APK artifact is missing; build it or set M2E_BUSINESS_APK_PATH.",
    artifacts: [],
    dataSummary: {
      apkPath: path.relative(root, apkPath),
      exists: appArtifactAvailable,
      skipInstall,
    },
  });

  if (!deviceId || !appArtifactAvailable) {
    return {
      runId,
      generatedAt,
      platform,
      runnerProfile,
      appId,
      apkPath: path.relative(root, apkPath),
      deviceId,
      setupPolicyProfile,
      readOnlyPolicyProfile,
      attemptedBusinessActionText,
      verdict: buildVerdict({
        deviceId,
        appArtifactAvailable,
        setupLaunched: false,
        inspectedScreen: false,
        policyDenied: false,
        remediationAvailable: false,
      }),
      steps,
      artifacts: [],
      appArtifactAvailable,
      setupLaunched: false,
      inspectedScreen: false,
      policyDenied: false,
      remediationAvailable: false,
    };
  }

  const setupSessionId = process.env.M2E_SETUP_SESSION_ID ?? `business-app-setup-${Date.now()}`;
  const readOnlySessionId = process.env.M2E_SESSION_ID ?? `business-app-readonly-${Date.now()}`;

  logStep("describe_capabilities");
  const capabilities = await server.invoke("describe_capabilities", { platform, runnerProfile });
  steps.push(summarizeResult(
    "describe_capabilities",
    capabilities,
    "Expose Android runner support boundaries before installing or launching the business app.",
  ));

  logStep("start_setup_session");
  const setupStarted = await server.invoke("start_session", {
    sessionId: setupSessionId,
    platform,
    deviceId,
    appId,
    profile: runnerProfile,
    policyProfile: setupPolicyProfile,
  });
  steps.push(summarizeResult(
    "start_setup_session",
    setupStarted,
    "Create a setup session with explicit install/launch permission for app readiness.",
  ));

  if (skipInstall) {
    steps.push({
      name: "install_app",
      status: "skipped",
      reasonCode: "SKIPPED",
      summary: "Skipped APK install because M2E_BUSINESS_SKIP_INSTALL=1; the app must already be installed on the selected device.",
      artifacts: [],
      dataSummary: { appId, apkPath: path.relative(root, apkPath), skipInstall },
    });
  } else {
    logStep("install_app");
    const installed = await server.invoke("install_app", {
      sessionId: setupSessionId,
      platform,
      deviceId,
      runnerProfile,
      artifactPath: apkPath,
    });
    steps.push(summarizeResult(
      "install_app",
      installed,
      "Install the demo business app through the governed MCP tool surface.",
      { apkPath: path.relative(root, apkPath) },
    ));
  }

  logStep("launch_app");
  const launched = await server.invoke("launch_app", {
    sessionId: setupSessionId,
    platform,
    deviceId,
    runnerProfile,
    appId,
  });
  steps.push(summarizeResult(
    "launch_app",
    launched,
    "Launch the demo business app before switching to read-only agent observation.",
  ));

  logStep("end_setup_session");
  const setupEnded = await server.invoke("end_session", {
    sessionId: setupSessionId,
    artifacts: [path.relative(root, outputDir)],
  });
  steps.push(summarizeResult(
    "end_setup_session",
    setupEnded,
    "Close the setup session and preserve readiness artifact references.",
  ));

  logStep("start_read_only_session");
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
    "Switch the agent workflow to read-only policy before observing and acting on the app.",
  ));

  logStep("inspect_ui");
  const inspectOutputPath = path.join(outputDir, "business-app-inspect-ui.xml");
  const inspected = await server.invoke("inspect_ui", {
    sessionId: readOnlySessionId,
    platform,
    deviceId,
    runnerProfile,
    appId,
    outputPath: inspectOutputPath,
  });
  steps.push(summarizeResult(
    "inspect_ui",
    inspected,
    "Capture the current business app UI hierarchy as read-only evidence.",
    summarizeInspect(inspected),
  ));

  logStep("get_screen_summary");
  const screen = await server.invoke("get_screen_summary", {
    sessionId: readOnlySessionId,
    platform,
    deviceId,
    runnerProfile,
    appId,
    includeDebugSignals: true,
  });
  steps.push(summarizeResult(
    "get_screen_summary",
    screen,
    "Summarize live business app screen state before attempting an agent-requested action.",
    summarizeScreen(screen),
  ));

  logStep("perform_action_with_evidence");
  const denied = await server.invoke("perform_action_with_evidence", {
    sessionId: readOnlySessionId,
    platform,
    deviceId,
    runnerProfile,
    appId,
    action: {
      actionType: "tap_element",
      text: attemptedBusinessActionText,
    },
  });
  steps.push(summarizeResult(
    "perform_action_with_evidence",
    denied,
    "Attempt a business UI action under read-only policy; expected result is structured policy denial.",
    { attemptedText: attemptedBusinessActionText },
  ));

  logStep("suggest_known_remediation");
  const remediation = await server.invoke("suggest_known_remediation", {
    sessionId: readOnlySessionId,
    platform,
    runnerProfile,
  });
  steps.push(summarizeResult(
    "suggest_known_remediation",
    remediation,
    "Ask for governance-specific next steps after the business action is denied.",
  ));

  logStep("end_read_only_session");
  const readOnlyEnded = await server.invoke("end_session", {
    sessionId: readOnlySessionId,
    artifacts: [path.relative(root, outputDir)],
  });
  steps.push(summarizeResult(
    "end_read_only_session",
    readOnlyEnded,
    "Close the read-only business workflow session and preserve proof artifact references.",
  ));

  const setupLaunched = asRecord(launched).status === "success";
  const inspectedScreen = asRecord(inspected).status === "success";
  const policyDenied = asRecord(denied).reasonCode === "POLICY_DENIED";
  const remediationAvailable = asRecord(remediation).reasonCode === "OK";
  return {
    runId,
    generatedAt,
    platform,
    runnerProfile,
    appId,
    apkPath: path.relative(root, apkPath),
    deviceId,
    setupSessionId,
    readOnlySessionId,
    setupPolicyProfile,
    readOnlyPolicyProfile,
    attemptedBusinessActionText,
    verdict: buildVerdict({ deviceId, appArtifactAvailable, setupLaunched, inspectedScreen, policyDenied, remediationAvailable }),
    steps,
    artifacts: [...new Set(steps.flatMap((step) => step.artifacts ?? []))],
    appArtifactAvailable,
    setupLaunched,
    inspectedScreen,
    policyDenied,
    remediationAvailable,
  };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const runId = process.env.M2E_BUSINESS_WORKFLOW_PROOF_RUN_ID ?? timestampId();
  const outputDir = path.resolve(root, "output/showcase/governed-business-app-workflow", runId);
  await mkdir(outputDir, { recursive: true });

  const proof = await runBusinessWorkflowProof(outputDir);

  await writeFile(path.join(outputDir, "business-workflow-proof.json"), `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMarkdown(proof), "utf8");

  if (proof.deviceId && proof.appArtifactAvailable) {
    assert.equal(proof.setupLaunched, true, "business app workflow should launch the demo app when device and APK are available");
    assert.equal(proof.inspectedScreen, true, "business app workflow should capture inspect_ui evidence");
    assert.equal(proof.policyDenied, true, "business app workflow should observe POLICY_DENIED under read-only policy");
    assert.equal(proof.remediationAvailable, true, "business app workflow should return governance guidance after policy denial");
  }

  console.log(`Governed business app workflow proof written to ${path.relative(root, outputDir)}`);
  console.log(JSON.stringify({
    runId,
    outputDir: path.relative(root, outputDir),
    deviceId: proof.deviceId ?? null,
    appId: proof.appId,
    verdict: proof.verdict,
    setupLaunched: proof.setupLaunched,
    inspectedScreen: proof.inspectedScreen,
    policyDenied: proof.policyDenied,
    remediationAvailable: proof.remediationAvailable,
  }, null, 2));

  if (
    (proof.verdict === "device_unavailable" && process.env.M2E_BUSINESS_WORKFLOW_ALLOW_NO_DEVICE !== "1") ||
    (proof.verdict === "app_artifact_unavailable" && process.env.M2E_BUSINESS_WORKFLOW_ALLOW_MISSING_APK !== "1") ||
    proof.verdict === "proof_inconclusive"
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
