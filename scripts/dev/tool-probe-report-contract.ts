import { join } from "node:path";

export const TOOL_PROBE_REPORT_SCHEMA_VERSION = "tool-probe-report/v1" as const;

export type ResultStatus = "success" | "failed" | "partial";
export type ObservedEffect = "observed" | "possible" | "not_observed" | "unknown";

export interface ToolResultLike {
  status: ResultStatus;
  reasonCode?: string;
  nextSuggestions?: string[];
  data?: unknown;
}

export interface ProbeRecord {
  tool: string;
  status: ResultStatus;
  reasonCode?: string;
  note?: string;
  next?: string;
  actionId?: string;
  observedEffect?: ObservedEffect;
  observedEvidence?: string;
}

export interface ProbeSummary {
  total: number;
  success: number;
  partial: number;
  failed: number;
  observed: number;
  possible: number;
  notObserved: number;
  unknown: number;
}

export interface ProbeArtifactPaths {
  artifactJsonPath: string;
  artifactMdPath: string;
  latestJsonPath: string;
  latestMdPath: string;
}

export interface ToolProbeReport {
  schemaVersion: typeof TOOL_PROBE_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  runId: string;
  probe: string;
  checklistSource: string;
  sessionId: string;
  deviceId: string;
  platform: string;
  runnerProfile: string;
  appId: string;
  flowPath: string;
  backend?: string;
  summary: ProbeSummary;
  records: ProbeRecord[];
  artifacts?: ProbeArtifactPaths;
}

export function buildProbeArtifactPaths(params: {
  probe: string;
  runId: string;
  evidenceRoot?: string;
  reportsDir?: string;
}): ProbeArtifactPaths {
  const evidenceRoot = params.evidenceRoot ?? join("output", "evidence", "probes");
  const reportsDir = params.reportsDir ?? "output/reports";
  const artifactsDir = join(evidenceRoot, params.probe, params.runId);

  return {
    artifactJsonPath: join(artifactsDir, "report.json"),
    artifactMdPath: join(artifactsDir, "summary.md"),
    latestJsonPath: join(reportsDir, `${params.probe}.json`),
    latestMdPath: join(reportsDir, `${params.probe}.md`),
  };
}

export function pickActionId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const envelope = data as { outcome?: unknown };
  if (!envelope.outcome || typeof envelope.outcome !== "object") return undefined;
  const outcome = envelope.outcome as { actionId?: unknown };
  return typeof outcome.actionId === "string" ? outcome.actionId : undefined;
}

export function summarizeProbeRecords(records: ProbeRecord[]): ProbeSummary {
  return {
    total: records.length,
    success: records.filter((r) => r.status === "success").length,
    partial: records.filter((r) => r.status === "partial").length,
    failed: records.filter((r) => r.status === "failed").length,
    observed: records.filter((r) => r.observedEffect === "observed").length,
    possible: records.filter((r) => r.observedEffect === "possible").length,
    notObserved: records.filter((r) => r.observedEffect === "not_observed").length,
    unknown: records.filter((r) => r.observedEffect === "unknown").length,
  };
}

export function inferObservedEffect(
  tool: string,
  result: ToolResultLike,
  records: ProbeRecord[],
): Pick<ProbeRecord, "observedEffect" | "observedEvidence"> {
  const laterUiVisibilityEvidence = records.some((r) =>
    ["wait_for_ui", "resolve_ui_target", "tap_element", "type_into_element"].includes(r.tool)
    && ["success", "partial"].includes(r.status),
  );

  if (result.status === "success") return { observedEffect: "observed", observedEvidence: "tool contract passed" };
  if (tool === "launch_app" && laterUiVisibilityEvidence) return { observedEffect: "observed", observedEvidence: "later UI probe reached Settings hierarchy" };
  if (tool === "wait_for_ui" && result.status === "partial") return { observedEffect: "observed", observedEvidence: "UI polling ran but target wait did not close" };
  if (tool === "resolve_ui_target" && result.status === "partial") return { observedEffect: "observed", observedEvidence: "target resolution saw live UI but did not find selector" };
  if (["execute_intent", "perform_action_with_evidence", "complete_task", "resume_interrupted_action"].includes(tool)
    && ["OCR_NO_MATCH", "OCR_AMBIGUOUS_TARGET", "TIMEOUT", "INTERRUPTION_RESOLUTION_FAILED"].includes(result.reasonCode ?? "")) {
    return { observedEffect: "possible", observedEvidence: "action likely dispatched but post-action verification did not close the loop" };
  }
  if (["scroll_and_resolve_ui_target", "tap_element", "type_into_element"].includes(tool) && result.reasonCode === "ADAPTER_ERROR") {
    return { observedEffect: "unknown", observedEvidence: "adapter-level failure prevents proving device interaction" };
  }
  if (result.status === "partial") return { observedEffect: "possible", observedEvidence: "partial result - some runtime progress but not closed contract" };
  if (result.status === "failed") return { observedEffect: "not_observed", observedEvidence: "no reliable evidence of intended device effect" };
  return { observedEffect: "unknown", observedEvidence: "no inference rule matched" };
}

export function reclassifyObservedEffects(records: ProbeRecord[]): ProbeRecord[] {
  return records.map((record, index) => {
    const priorAndLater = records.filter((_, i) => i !== index);
    const observed = inferObservedEffect(record.tool, {
      status: record.status,
      reasonCode: record.reasonCode,
      nextSuggestions: record.next ? [record.next] : undefined,
    }, priorAndLater);
    return { ...record, observedEffect: observed.observedEffect, observedEvidence: observed.observedEvidence };
  });
}

export function buildToolProbeReport(params: Omit<ToolProbeReport, "schemaVersion" | "generatedAt" | "summary"> & {
  generatedAt?: string;
}): ToolProbeReport {
  return {
    schemaVersion: TOOL_PROBE_REPORT_SCHEMA_VERSION,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    ...params,
    summary: summarizeProbeRecords(params.records),
  };
}

function markdownCell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderToolProbeMarkdown(report: ToolProbeReport, title: string): string {
  return [
    `# ${title}`, "",
    `- Schema: ${report.schemaVersion}`,
    `- Generated At: ${report.generatedAt}`,
    `- Run: ${report.runId}`,
    `- Probe: ${report.probe}`,
    `- Session: ${report.sessionId}`,
    `- Device: ${report.deviceId}`,
    `- Platform: ${report.platform}`,
    `- Runner Profile: ${report.runnerProfile}`,
    report.backend ? `- Backend: ${report.backend}` : undefined,
    `- App: ${report.appId}`,
    `- Flow: ${report.flowPath}`,
    `- Checklist: ${report.checklistSource}`,
    "",
    `- Total: ${report.summary.total}`,
    `- Success: ${report.summary.success}`,
    `- Partial: ${report.summary.partial}`,
    `- Failed: ${report.summary.failed}`,
    `- Observed: ${report.summary.observed}`,
    `- Possible: ${report.summary.possible}`,
    `- Not observed: ${report.summary.notObserved}`,
    `- Unknown: ${report.summary.unknown}`,
    "",
    "| Tool | Verdict | Observed effect | Evidence | Reason | Note |",
    "|---|---|---|---|---|---|",
    ...report.records.map((r) => [
      markdownCell(r.tool),
      markdownCell(r.status),
      markdownCell(r.observedEffect ?? "unknown"),
      markdownCell(r.observedEvidence),
      markdownCell(r.reasonCode),
      markdownCell(r.note),
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function validateToolProbeReportContract(report: ToolProbeReport): string[] {
  const issues: string[] = [];

  if (report.schemaVersion !== TOOL_PROBE_REPORT_SCHEMA_VERSION) issues.push("schemaVersion must be tool-probe-report/v1");
  for (const field of ["generatedAt", "runId", "probe", "checklistSource", "sessionId", "deviceId", "platform", "runnerProfile", "appId", "flowPath"] as const) {
    if (typeof report[field] !== "string" || report[field].length === 0) issues.push(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(report.records)) issues.push("records must be an array");
  if (!report.summary || typeof report.summary !== "object") issues.push("summary must be an object");

  const expectedSummary = summarizeProbeRecords(report.records ?? []);
  for (const field of Object.keys(expectedSummary) as Array<keyof ProbeSummary>) {
    if (report.summary?.[field] !== expectedSummary[field]) issues.push(`summary.${field} must match records`);
  }

  report.records?.forEach((record, index) => {
    if (typeof record.tool !== "string" || record.tool.length === 0) issues.push(`records[${index}].tool must be a non-empty string`);
    if (!["success", "failed", "partial"].includes(record.status)) issues.push(`records[${index}].status is invalid`);
    if (record.observedEffect && !["observed", "possible", "not_observed", "unknown"].includes(record.observedEffect)) {
      issues.push(`records[${index}].observedEffect is invalid`);
    }
  });

  return issues;
}
