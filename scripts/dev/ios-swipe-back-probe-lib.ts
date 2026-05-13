export type ResultStatus = "success" | "failed" | "partial";

export interface ToolResultLike {
  status: ResultStatus;
  reasonCode?: string;
  data?: unknown;
  nextSuggestions?: string[];
}

export interface PageSnapshot {
  title?: string;
  screenId?: string;
  treeHash?: string;
  visibleElementCount?: number;
  identityConfidence?: number;
}

export interface SwipeBackProbeSummary {
  runId: string;
  sessionId: string;
  deviceId: string;
  platform: string;
  runnerProfile: string;
  appId: string;
  entryText: string;
  verdict: "pass" | "fail";
  status: ResultStatus;
  reasonCode?: string;
  executedStrategy?: string;
  command?: string;
  commandHistory?: string[];
  stateChanged?: boolean | "unknown";
  pageTreeHashUnchanged?: boolean;
  preBack: PageSnapshot;
  postBack: PageSnapshot;
  nextSuggestions: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function parseCandidateList(defaultCandidates: string, envCandidates?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const source of [defaultCandidates, envCandidates ?? ""]) {
    for (const raw of source.split(",")) {
      const candidate = raw.trim();
      const key = candidate.toLowerCase();
      if (!candidate || seen.has(key)) continue;
      seen.add(key);
      result.push(candidate);
    }
  }
  return result;
}

export function extractPageSnapshot(result: unknown): PageSnapshot {
  const root = asRecord(result);
  const data = asRecord(root?.data);
  const screenSummary = asRecord(data?.screenSummary);
  const pageIdentity = asRecord(screenSummary?.pageIdentity);

  return {
    title: asString(screenSummary?.screenTitle) ?? asString(screenSummary?.title) ?? asString(pageIdentity?.primaryHeading),
    screenId: asString(screenSummary?.screenId),
    treeHash: asString(pageIdentity?.treeHash),
    visibleElementCount: asNumber(pageIdentity?.visibleElementCount),
    identityConfidence: asNumber(pageIdentity?.identityConfidence),
  };
}

export function summarizeSwipeBackProbe(params: {
  runId: string;
  sessionId: string;
  deviceId: string;
  platform: string;
  runnerProfile: string;
  appId: string;
  entryText: string;
  preBack: PageSnapshot;
  postBack: PageSnapshot;
  navigateBack: ToolResultLike;
}): SwipeBackProbeSummary {
  const data = asRecord(params.navigateBack.data);
  const stateChanged = asBoolean(data?.stateChanged)
    ?? (data?.stateChanged === "unknown" ? "unknown" : undefined);
  const status = params.navigateBack.status;
  const executedStrategy = asString(data?.executedStrategy);
  const pageTreeHashUnchanged = asBoolean(data?.pageTreeHashUnchanged);
  const verdict = status === "success"
    && executedStrategy === "ios_edge_swipe"
    && stateChanged !== false
    ? "pass"
    : "fail";

  return {
    runId: params.runId,
    sessionId: params.sessionId,
    deviceId: params.deviceId,
    platform: params.platform,
    runnerProfile: params.runnerProfile,
    appId: params.appId,
    entryText: params.entryText,
    verdict,
    status,
    reasonCode: params.navigateBack.reasonCode,
    executedStrategy,
    command: asString(data?.command),
    commandHistory: Array.isArray(data?.commandHistory)
      ? data.commandHistory.filter((item): item is string => typeof item === "string")
      : undefined,
    stateChanged,
    pageTreeHashUnchanged,
    preBack: {
      ...params.preBack,
      treeHash: asString(data?.preBackTreeHash) ?? params.preBack.treeHash,
    },
    postBack: {
      ...params.postBack,
      treeHash: asString(data?.postBackTreeHash) ?? params.postBack.treeHash,
    },
    nextSuggestions: params.navigateBack.nextSuggestions ?? [],
  };
}

function valueOrDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}

function fenced(value?: string): string {
  return value ? `\n\`\`\`text\n${value}\n\`\`\`` : "-";
}

export function buildSwipeBackProbeMarkdown(summary: SwipeBackProbeSummary): string {
  return [
    "# iOS Swipe Back Probe Report",
    "",
    `- Run: ${summary.runId}`,
    `- Session: ${summary.sessionId}`,
    `- Device: ${summary.deviceId}`,
    `- Platform: ${summary.platform}`,
    `- Runner Profile: ${summary.runnerProfile}`,
    `- App: ${summary.appId}`,
    `- Entry: ${summary.entryText}`,
    `- Verdict: ${summary.verdict}`,
    "",
    "## navigate_back",
    "",
    `- Status: ${summary.status}`,
    `- Reason: ${summary.reasonCode ?? "-"}`,
    `- Executed strategy: ${summary.executedStrategy ?? "-"}`,
    `- State changed: ${valueOrDash(summary.stateChanged)}`,
    `- Page tree hash unchanged: ${valueOrDash(summary.pageTreeHashUnchanged)}`,
    "",
    "### Command",
    fenced(summary.command),
    "",
    "### Command History",
    ...(summary.commandHistory && summary.commandHistory.length > 0
      ? summary.commandHistory.map((command, index) => `${index + 1}. \`${command.replaceAll("`", "\\`")}\``)
      : ["-"]),
    "",
    "## Page State",
    "",
    "| Moment | Title | Screen ID | Tree Hash | Visible Elements | Confidence |",
    "|---|---|---|---|---|---|",
    `| Before swipe | ${valueOrDash(summary.preBack.title)} | ${valueOrDash(summary.preBack.screenId)} | ${valueOrDash(summary.preBack.treeHash)} | ${valueOrDash(summary.preBack.visibleElementCount)} | ${valueOrDash(summary.preBack.identityConfidence)} |`,
    `| After swipe | ${valueOrDash(summary.postBack.title)} | ${valueOrDash(summary.postBack.screenId)} | ${valueOrDash(summary.postBack.treeHash)} | ${valueOrDash(summary.postBack.visibleElementCount)} | ${valueOrDash(summary.postBack.identityConfidence)} |`,
    "",
    "## Suggestions",
    "",
    ...(summary.nextSuggestions.length > 0
      ? summary.nextSuggestions.map((item) => `- ${item}`)
      : ["- -"]),
    "",
  ].join("\n");
}
