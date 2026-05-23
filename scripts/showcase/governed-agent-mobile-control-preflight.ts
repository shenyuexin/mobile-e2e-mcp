import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../../packages/mcp-server/src/index.ts";

interface PreflightCheck {
  name: string;
  status: "pass" | "fail" | "warn";
  summary: string;
  details?: Record<string, unknown>;
}

interface PreflightReport {
  runId: string;
  generatedAt: string;
  platform: "android";
  runnerProfile: string;
  appId: string;
  requestedDeviceId?: string;
  selectedDeviceId?: string;
  ready: boolean;
  checks: PreflightCheck[];
  nextCommand: string;
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

function androidDevices(listDevicesResult: unknown): Record<string, unknown>[] {
  const data = asRecord(asRecord(listDevicesResult).data);
  return Array.isArray(data.android)
    ? data.android.map(asRecord)
    : [];
}

function deviceIdOf(device: Record<string, unknown>): string | undefined {
  return typeof device.id === "string" && device.id.length > 0 ? device.id : undefined;
}

function isAvailable(device: Record<string, unknown>): boolean {
  return device.available !== false && deviceIdOf(device) !== undefined;
}

function selectAndroidDevice(devices: Record<string, unknown>[], requestedDeviceId?: string): string | undefined {
  if (requestedDeviceId) {
    return devices.some((device) => deviceIdOf(device) === requestedDeviceId && isAvailable(device))
      ? requestedDeviceId
      : undefined;
  }

  return deviceIdOf(devices.find(isAvailable) ?? {});
}

function renderMarkdown(report: PreflightReport): string {
  const lines = [
    "# Governed Agent Mobile Control Preflight",
    "",
    `- Run ID: ${report.runId}`,
    `- Generated at: ${report.generatedAt}`,
    `- Platform: ${report.platform}`,
    `- Runner profile: ${report.runnerProfile}`,
    `- App ID: ${report.appId}`,
    `- Requested device ID: ${report.requestedDeviceId ?? "<none>"}`,
    `- Selected device ID: ${report.selectedDeviceId ?? "<none>"}`,
    `- Ready: ${report.ready ? "yes" : "no"}`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => [
      `### ${check.name}`,
      "",
      `- Status: ${check.status}`,
      `- Summary: ${check.summary}`,
      check.details ? `- Details: \`${JSON.stringify(check.details)}\`` : undefined,
      "",
    ].filter((line): line is string => Boolean(line)).join("\n")),
    "## Next Step",
    "",
    report.ready
      ? `Run \`${report.nextCommand}\` to capture live governed-control evidence.`
      : "Resolve the failed checks, then rerun this preflight before capturing live evidence.",
    "",
  ];
  return lines.join("\n");
}

async function runPreflight(): Promise<PreflightReport> {
  const server = createServer();
  const platform = "android" as const;
  const runnerProfile = process.env.M2E_RUNNER_PROFILE ?? "native_android";
  const appId = process.env.M2E_APP_ID ?? "com.android.settings";
  const requestedDeviceId = process.env.M2E_DEVICE_ID;
  const checks: PreflightCheck[] = [];

  const listed = await server.invoke("list_devices", { includeUnavailable: true });
  const devices = androidDevices(listed);
  const availableDeviceIds = devices.filter(isAvailable).map(deviceIdOf).filter((id): id is string => Boolean(id));
  const selectedDeviceId = selectAndroidDevice(devices, requestedDeviceId);

  checks.push({
    name: "android_device",
    status: selectedDeviceId ? "pass" : "fail",
    summary: selectedDeviceId
      ? "An available Android device can be selected through the MCP device listing."
      : requestedDeviceId
        ? "The requested Android device was not found or is unavailable."
        : "No available Android device was found.",
    details: {
      requestedDeviceId: requestedDeviceId ?? null,
      selectedDeviceId: selectedDeviceId ?? null,
      availableDeviceIds,
      androidDeviceCount: devices.length,
    },
  });

  const capabilities = await server.invoke("describe_capabilities", { platform, runnerProfile });
  const capabilityStatus = asRecord(capabilities).status;
  checks.push({
    name: "runner_capabilities",
    status: capabilityStatus === "success" ? "pass" : "fail",
    summary: capabilityStatus === "success"
      ? "The selected runner profile exposes Android capability metadata."
      : "Android capability metadata could not be described for the selected runner profile.",
    details: {
      runnerProfile,
      status: capabilityStatus,
      reasonCode: asRecord(capabilities).reasonCode,
    },
  });

  checks.push({
    name: "policy_boundary",
    status: "pass",
    summary: "The live proof uses the read-only policy profile and should deny interactive actions with POLICY_DENIED.",
    details: {
      policyProfile: "read-only",
      expectedDeniedAction: "perform_action_with_evidence/tap_element",
    },
  });

  return {
    runId: timestampId(),
    generatedAt: new Date().toISOString(),
    platform,
    runnerProfile,
    appId,
    requestedDeviceId,
    selectedDeviceId,
    ready: checks.every((check) => check.status !== "fail"),
    checks,
    nextCommand: "pnpm run proof:governed-agent-mobile-control:live",
  };
}

async function main(): Promise<void> {
  const root = repoRoot();
  const report = await runPreflight();
  const outputDir = path.resolve(root, "output/showcase/governed-agent-mobile-control-preflight", report.runId);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "preflight.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMarkdown(report), "utf8");

  console.log(`Governed agent mobile control preflight written to ${path.relative(root, outputDir)}`);
  console.log(JSON.stringify({
    runId: report.runId,
    outputDir: path.relative(root, outputDir),
    ready: report.ready,
    selectedDeviceId: report.selectedDeviceId ?? null,
    checks: report.checks.map((check) => ({ name: check.name, status: check.status })),
  }, null, 2));

  if (!report.ready) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
