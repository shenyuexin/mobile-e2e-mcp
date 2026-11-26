import type {
  ExplainLastFailureData,
  InspectUiData,
  InspectUiNode,
  SuggestKnownRemediationData,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";

/** A single proposal-only selector candidate extracted from live UI evidence. */
export interface HealSelectorCandidate {
  field: "resourceId" | "contentDesc" | "text" | "className";
  value: string;
  source: "inspect_ui";
}

/** Availability of each evidence source used to build the proposal. */
export interface HealEvidenceSources {
  explainLastFailure: "used" | "unavailable";
  suggestKnownRemediation: "used" | "unavailable";
  inspectUi: "used" | "unavailable";
}

/** Structured, proposal-only selector heal suggestion. */
export interface SelectorHealProposal {
  /** Always true — this object never changes files on disk. */
  proposalOnly: true;
  flowPath?: string;
  actionId?: string;
  diagnosis: string;
  remediation: string[];
  selectorCandidates: HealSelectorCandidate[];
  /** Human-readable unified diff snippet. Nothing is applied. */
  unifiedDiff: string;
  sources: HealEvidenceSources;
}

export interface BuildHealProposalInput {
  flowPath?: string;
  originalFlowText?: string;
  explainResult?: ToolResult<ExplainLastFailureData>;
  remediationResult?: ToolResult<SuggestKnownRemediationData>;
  inspectResult?: ToolResult<InspectUiData>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function buildDiagnosis(explainResult?: ToolResult<ExplainLastFailureData>): string {
  const data = explainResult?.data;
  if (!explainResult || explainResult.status !== "success" || !data) {
    return "No failure explanation was available; selector heuristics are best-effort only.";
  }
  const parts: string[] = [];
  const attribution = asRecord(data.attribution);
  const packet = asRecord(data.diagnosisPacket);
  const outcome = asRecord(data.outcome);
  for (const value of [
    stringField(attribution?.mostLikelyCause),
    stringField(packet?.strongestCausalSignal),
    stringField(attribution?.recommendedNextProbe),
    stringField(outcome?.reasonCode),
  ]) {
    if (value && !parts.includes(value)) parts.push(value);
  }
  return parts.length > 0
    ? parts.join(" | ")
    : `Failure reason: ${explainResult.reasonCode}; no selector-specific signal available.`;
}

function buildRemediation(remediationResult?: ToolResult<SuggestKnownRemediationData>): string[] {
  const data = remediationResult?.data;
  if (!remediationResult || remediationResult.status !== "success" || !data) return [];
  const items = [...(data.remediation ?? [])];
  const firstFix = stringField(asRecord(data.skillGuidance)?.firstFix);
  if (firstFix && !items.includes(firstFix)) items.push(firstFix);
  return items;
}

function buildCandidates(inspectResult?: ToolResult<InspectUiData>): HealSelectorCandidate[] {
  const data = inspectResult?.data;
  if (!inspectResult || inspectResult.status !== "success" || !data) return [];
  const nodes = (data.summary?.sampleNodes ?? []) as InspectUiNode[];
  const candidates: HealSelectorCandidate[] = [];
  const seen = new Set<string>();
  for (const node of [...nodes].sort((a, b) => Number(b.clickable) - Number(a.clickable))) {
    for (const field of ["resourceId", "contentDesc", "text", "className"] as const) {
      const value = stringField(node?.[field]);
      if (!value) continue;
      const key = `${field}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ field, value, source: "inspect_ui" });
    }
  }
  return candidates.slice(0, 8);
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Build a readable unified diff for a selector proposal. This is a string
 * artifact only — callers never write it back to a flow file.
 */
export function formatHealUnifiedDiff(
  originalFlowText: string | undefined,
  flowPath: string | undefined,
  proposal: Pick<SelectorHealProposal, "diagnosis" | "remediation" | "selectorCandidates">,
): string {
  const label = flowPath ?? "flow.yaml";
  const commentLines = [
    "# proposal-only selector heal — review before applying",
    `# diagnosis: ${proposal.diagnosis.replace(/\r?\n/g, " ")}`,
    ...proposal.remediation.slice(0, 3).map((item) => `# remediation: ${item.replace(/\r?\n/g, " ")}`),
    ...proposal.selectorCandidates
      .slice(0, 3)
      .map((candidate) => `# prefer ${candidate.field}: ${yamlString(candidate.value)}`),
  ];

  if (!originalFlowText) {
    return [
      `--- a/${label}`,
      `+++ b/${label}`,
      `@@ -0,0 +1,${commentLines.length} @@`,
      ...commentLines.map((line) => `+${line}`),
    ].join("\n");
  }

  const lines = originalFlowText.split(/\r?\n/);
  const targetIndex = Math.max(
    0,
    lines.findIndex((line) => /tapOn|tap_element|\btap\b/.test(line)),
  );
  const hunkStart = Math.max(0, targetIndex - 2);
  const before = lines.slice(hunkStart, targetIndex + 1);
  const after = lines.slice(targetIndex + 1, targetIndex + 3);
  const oldCount = before.length + after.length;
  const newCount = oldCount + commentLines.length;

  return [
    `--- a/${label}`,
    `+++ b/${label}`,
    `@@ -${hunkStart + 1},${oldCount} +${hunkStart + 1},${newCount} @@`,
    ...before.map((line) => ` ${line}`),
    ...commentLines.map((line) => `+${line}`),
    ...after.map((line) => ` ${line}`),
  ].join("\n");
}

/** Assemble a structured, proposal-only selector heal suggestion. */
export function buildSelectorHealProposal(input: BuildHealProposalInput): SelectorHealProposal {
  const actionId = stringField(asRecord(input.explainResult?.data)?.actionId);
  const diagnosis = buildDiagnosis(input.explainResult);
  const remediation = buildRemediation(input.remediationResult);
  const selectorCandidates = buildCandidates(input.inspectResult);
  const proposal: SelectorHealProposal = {
    proposalOnly: true,
    ...(input.flowPath ? { flowPath: input.flowPath } : {}),
    ...(actionId ? { actionId } : {}),
    diagnosis,
    remediation,
    selectorCandidates,
    unifiedDiff: "",
    sources: {
      explainLastFailure: input.explainResult?.status === "success" ? "used" : "unavailable",
      suggestKnownRemediation:
        input.remediationResult?.status === "success" ? "used" : "unavailable",
      inspectUi: input.inspectResult?.status === "success" ? "used" : "unavailable",
    },
  };
  proposal.unifiedDiff = formatHealUnifiedDiff(input.originalFlowText, input.flowPath, proposal);
  return proposal;
}
