import {
  type CaptureJsConsoleLogsData,
  type CaptureJsConsoleLogsInput,
  type CaptureJsNetworkEventsData,
  type CaptureJsNetworkEventsInput,
  type DebugSignalSummary,
  type JsConsoleLogEntry,
  type JsConsoleLogSummary,
  type JsDebugTarget,
  type JsFailureGroup,
  type JsNetworkEvent,
  type JsNetworkFailureSummary,
  type JsStackFrame,
  type ListJsDebugTargetsData,
  type ListJsDebugTargetsInput,
  type ToolResult,
  REASON_CODES,
} from "@mobile-e2e-mcp/contracts";
import { isRecord, readNonEmptyString } from "./harness-config.js";

const DEFAULT_METRO_BASE_URL = "http://127.0.0.1:8081";
const DEFAULT_METRO_TIMEOUT_MS = 3000;
const DEFAULT_JS_LOG_MAX_LOGS = 50;
const DEFAULT_JS_NETWORK_MAX_EVENTS = 30;

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

export function normalizeMetroBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.replace(/\/+$/, "") : DEFAULT_METRO_BASE_URL;
}

function normalizeConsoleArguments(rawArgs: unknown): string {
  if (!Array.isArray(rawArgs)) {
    return "";
  }

  return rawArgs
    .map((item) => {
      if (!isRecord(item)) {
        return "";
      }
      const value = readNonEmptyString(item, "value");
      if (value) {
        return value;
      }
      const description = readNonEmptyString(item, "description");
      return description ?? "";
    })
    .filter((item) => item.length > 0)
    .join(" ");
}

function normalizeStackFrames(rawStackTrace: unknown): JsStackFrame[] | undefined {
  if (!isRecord(rawStackTrace) || !Array.isArray(rawStackTrace.callFrames)) {
    return undefined;
  }

  const frames = rawStackTrace.callFrames
    .map((frame): JsStackFrame | undefined => {
      if (!isRecord(frame)) {
        return undefined;
      }

      return {
        functionName: readNonEmptyString(frame, "functionName") ?? undefined,
        scriptId: readNonEmptyString(frame, "scriptId") ?? undefined,
        url: readNonEmptyString(frame, "url") ?? undefined,
        lineNumber: typeof frame.lineNumber === "number" ? frame.lineNumber : undefined,
        columnNumber: typeof frame.columnNumber === "number" ? frame.columnNumber : undefined,
        native: typeof frame.native === "boolean" ? frame.native : undefined,
      };
    })
    .filter((frame): frame is JsStackFrame => frame !== undefined);

  return frames.length > 0 ? frames : undefined;
}

export function normalizeJsDebugTarget(raw: unknown): JsDebugTarget | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const id = readNonEmptyString(raw, "id") ?? readNonEmptyString(raw, "deviceId");
  if (!id) {
    return undefined;
  }

  return {
    id,
    title: readNonEmptyString(raw, "title") ?? undefined,
    description: readNonEmptyString(raw, "description") ?? undefined,
    deviceName: readNonEmptyString(raw, "deviceName") ?? undefined,
    webSocketDebuggerUrl: readNonEmptyString(raw, "webSocketDebuggerUrl") ?? undefined,
  };
}

export function rankJsDebugTarget(target: JsDebugTarget): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  if (target.webSocketDebuggerUrl) {
    score += 100;
    reasons.push("has websocket debugger URL");
  }

  const searchable = [target.title, target.description, target.deviceName].filter(Boolean).join(" ").toLowerCase();
  if (searchable.includes("react native") || searchable.includes("react-native")) {
    score += 40;
    reasons.push("mentions React Native");
  }
  if (searchable.includes("expo")) {
    score += 25;
    reasons.push("mentions Expo");
  }
  if (searchable.includes("hermes")) {
    score += 10;
    reasons.push("mentions Hermes");
  }
  if (searchable.includes("chrome")) {
    score -= 5;
    reasons.push("looks like Chrome debugger");
  }

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(", ") : "fallback to original target order",
  };
}

export function selectPreferredJsDebugTargetWithReason(targets: JsDebugTarget[]): { target?: JsDebugTarget; reason?: string } {
  const ranked = [...targets]
    .map((target, index) => ({ target, index, ...rankJsDebugTarget(target) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const winner = ranked[0];
  return winner ? { target: winner.target, reason: winner.reason } : {};
}

export function selectPreferredJsDebugTarget(targets: JsDebugTarget[]): JsDebugTarget | undefined {
  return selectPreferredJsDebugTargetWithReason(targets).target;
}

export function buildJsDebugTargetSelectionNarrativeLine(target: JsDebugTarget | undefined, reason: string | undefined): string {
  if (!target) {
    return "Metro target auto-discovery did not find a debuggable JS target.";
  }

  const base = `Metro target auto-discovery selected ${target.id}${target.title ? ` (${target.title})` : ""}.`;
  return reason ? `${base} Reason: ${reason}.` : base;
}

function buildInspectorWebSocketUrl(metroBaseUrl: string, targetId: string): string {
  const base = new URL(metroBaseUrl);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/inspector/debug";
  base.search = `target=${encodeURIComponent(targetId)}`;
  return base.toString();
}

export function buildInspectorExceptionLogEntry(params: unknown): JsConsoleLogEntry {
  const safeParams = isRecord(params) ? params : {};
  const details = isRecord(safeParams.exceptionDetails) ? safeParams.exceptionDetails : {};
  const exception = isRecord(details.exception) ? details.exception : {};
  const stackFrames = normalizeStackFrames(details.stackTrace);

  return {
    level: "exception",
    text: readNonEmptyString(details, "text") ?? readNonEmptyString(exception, "description") ?? readNonEmptyString(details, "exceptionId") ?? "Runtime.exceptionThrown",
    timestamp: typeof safeParams.timestamp === "number" ? safeParams.timestamp : undefined,
    exceptionId: typeof details.exceptionId === "number" ? details.exceptionId : undefined,
    executionContextId: typeof details.executionContextId === "number" ? details.executionContextId : undefined,
    sourceUrl: readNonEmptyString(details, "url") ?? undefined,
    lineNumber: typeof details.lineNumber === "number" ? details.lineNumber : undefined,
    columnNumber: typeof details.columnNumber === "number" ? details.columnNumber : undefined,
    exceptionType: readNonEmptyString(exception, "className") ?? undefined,
    exceptionDescription: readNonEmptyString(exception, "description") ?? undefined,
    stackTraceText: readNonEmptyString(exception, "description") ?? undefined,
    remote: typeof exception.subtype === "string" ? exception.subtype === "error" : undefined,
    stackFrameCount: stackFrames?.length,
    stackFrames,
  };
}

export function buildJsConsoleLogSummary(logs: JsConsoleLogEntry[]): JsConsoleLogSummary {
  const levelCounts = logs.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.level] = (acc[entry.level] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalLogs: logs.length,
    exceptionCount: logs.filter((entry) => entry.level === "exception").length,
    levelCounts,
  };
}

function buildFailureGroups(values: Array<{ key?: string; sampleUrl?: string }>): JsFailureGroup[] {
  const groups = new Map<string, JsFailureGroup>();
  for (const value of values) {
    if (!value.key) {
      continue;
    }
    const current = groups.get(value.key) ?? { key: value.key, count: 0, sampleUrl: value.sampleUrl };
    current.count += 1;
    current.sampleUrl ??= value.sampleUrl;
    groups.set(value.key, current);
  }

  return [...groups.values()].sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

export function buildJsNetworkFailureSummary(events: JsNetworkEvent[]): JsNetworkFailureSummary {
  const failedEvents = events.filter((event) => Boolean(event.errorText) || (typeof event.status === "number" && event.status >= 400));

  return {
    totalTrackedRequests: events.length,
    failedRequestCount: failedEvents.length,
    clientErrors: failedEvents.filter((event) => typeof event.status === "number" && event.status >= 400 && event.status < 500).length,
    serverErrors: failedEvents.filter((event) => typeof event.status === "number" && event.status >= 500).length,
    networkErrors: failedEvents.filter((event) => Boolean(event.errorText)).length,
    statusGroups: buildFailureGroups(failedEvents.map((event) => ({ key: typeof event.status === "number" ? String(event.status) : undefined, sampleUrl: event.url }))),
    errorGroups: buildFailureGroups(failedEvents.map((event) => ({ key: event.errorText, sampleUrl: event.url }))),
    hostGroups: buildFailureGroups(failedEvents.map((event) => {
      if (!event.url) {
        return { key: undefined, sampleUrl: undefined };
      }
      try {
        const parsed = new URL(event.url);
        return { key: parsed.host, sampleUrl: event.url };
      } catch {
        return { key: undefined, sampleUrl: event.url };
      }
    })),
  };
}

export function buildJsNetworkSuspectSentences(summary: JsNetworkFailureSummary): string[] {
  const suspects: string[] = [];
  const topHost = summary.hostGroups[0];
  const topStatus = summary.statusGroups[0];
  const topError = summary.errorGroups[0];

  if (topHost && topStatus) {
    suspects.push(`Network suspect: host ${topHost.key} is associated with repeated ${topStatus.key} responses (${String(topStatus.count)} occurrence(s))${topStatus.sampleUrl ? ` via ${topStatus.sampleUrl}` : ""}.`);
  } else if (topStatus) {
    suspects.push(`Network suspect: repeated HTTP ${topStatus.key} responses (${String(topStatus.count)} occurrence(s))${topStatus.sampleUrl ? ` via ${topStatus.sampleUrl}` : ""}.`);
  }

  if (topError) {
    suspects.push(`Network transport suspect: ${topError.key} (${String(topError.count)} occurrence(s))${topError.sampleUrl ? ` via ${topError.sampleUrl}` : ""}.`);
  }

  if (summary.failedRequestCount > 0 && suspects.length === 0) {
    suspects.push(`Network suspect: ${String(summary.failedRequestCount)} failed request(s) were captured.`);
  }

  return suspects.slice(0, 3);
}

function shouldKeepNetworkEvent(event: JsNetworkEvent, failuresOnly: boolean): boolean {
  if (!failuresOnly) {
    return true;
  }

  return Boolean(event.errorText) || (typeof event.status === "number" && event.status >= 400);
}

export function formatJsConsoleEntry(entry: JsConsoleLogEntry): string {
  const location = entry.sourceUrl ? ` @ ${entry.sourceUrl}${typeof entry.lineNumber === "number" ? `:${String(entry.lineNumber)}` : ""}${typeof entry.columnNumber === "number" ? `:${String(entry.columnNumber)}` : ""}` : "";
  const stackLead = entry.stackFrames?.[0]
    ? ` | top frame: ${entry.stackFrames[0].functionName ?? "<anonymous>"}${entry.stackFrames[0].url ? ` @ ${entry.stackFrames[0].url}` : ""}`
    : "";
  return `- [${entry.level}] ${entry.text}${location}${stackLead}`;
}

export async function listJsDebugTargetsWithMaestro(input: ListJsDebugTargetsInput): Promise<ToolResult<ListJsDebugTargetsData>> {
  const startTime = Date.now();
  const sessionId = input.sessionId ?? `js-debug-targets-${Date.now()}`;
  const metroBaseUrl = normalizeMetroBaseUrl(input.metroBaseUrl);
  const endpoint = `${metroBaseUrl}/json/list`;

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: true, metroBaseUrl, endpoint, targetCount: 0, targets: [] },
      nextSuggestions: ["Run list_js_debug_targets without dryRun while Metro is running to discover debuggable RN targets."],
    };
  }

  const controller = new AbortController();
  const timeoutMs = normalizePositiveInteger(input.timeoutMs, DEFAULT_METRO_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  unrefTimer(timer);

  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) {
      return {
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: { dryRun: false, metroBaseUrl, endpoint, targetCount: 0, targets: [] },
        nextSuggestions: ["Ensure Metro is running and exposing /json/list before retrying list_js_debug_targets."],
      };
    }

    const parsed: unknown = await response.json();
    const targets = Array.isArray(parsed) ? parsed.map(normalizeJsDebugTarget).filter((value): value is JsDebugTarget => value !== undefined) : [];
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: false, metroBaseUrl, endpoint, targetCount: targets.length, targets },
      nextSuggestions: targets.length === 0 ? ["Metro responded, but no JS debug targets are currently attached."] : [],
    };
  } catch {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: { dryRun: false, metroBaseUrl, endpoint, targetCount: 0, targets: [] },
      nextSuggestions: ["Start Metro or Expo dev server and verify that /json/list is reachable before retrying list_js_debug_targets."],
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function captureJsConsoleLogsWithMaestro(input: CaptureJsConsoleLogsInput): Promise<ToolResult<CaptureJsConsoleLogsData>> {
  const startTime = Date.now();
  const sessionId = input.sessionId ?? `js-console-logs-${Date.now()}`;
  const metroBaseUrl = normalizeMetroBaseUrl(input.metroBaseUrl);
  const timeoutMs = normalizePositiveInteger(input.timeoutMs, DEFAULT_METRO_TIMEOUT_MS);
  const maxLogs = normalizePositiveInteger(input.maxLogs, DEFAULT_JS_LOG_MAX_LOGS);
  const webSocketDebuggerUrl = input.webSocketDebuggerUrl ?? (input.targetId ? buildInspectorWebSocketUrl(metroBaseUrl, input.targetId) : "");

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        metroBaseUrl,
        targetId: input.targetId,
        webSocketDebuggerUrl,
        collectedCount: 0,
        logs: [],
        summary: buildJsConsoleLogSummary([]),
      },
      nextSuggestions: ["Run capture_js_console_logs without dryRun while Metro inspector is available and provide targetId or webSocketDebuggerUrl."],
    };
  }

  if (!webSocketDebuggerUrl) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        metroBaseUrl,
        targetId: input.targetId,
        webSocketDebuggerUrl,
        collectedCount: 0,
        logs: [],
        summary: buildJsConsoleLogSummary([]),
      },
      nextSuggestions: ["Call list_js_debug_targets first, then pass targetId or webSocketDebuggerUrl into capture_js_console_logs."],
    };
  }

  const logs: JsConsoleLogEntry[] = [];
  const ws = new WebSocket(webSocketDebuggerUrl);

  return await new Promise<ToolResult<CaptureJsConsoleLogsData>>((resolve) => {
    let settled = false;
    let messageId = 1;
    const finish = (result: ToolResult<CaptureJsConsoleLogsData>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        return resolve(result);
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          metroBaseUrl,
          targetId: input.targetId,
          webSocketDebuggerUrl,
          collectedCount: logs.length,
          logs,
          summary: buildJsConsoleLogSummary(logs),
        },
        nextSuggestions: logs.length === 0 ? ["No JS console events arrived before timeout. Confirm the target is active and emitting logs."] : [],
      });
    }, timeoutMs);
    unrefTimer(timer);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: messageId++, method: "Runtime.enable" }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.method === "Runtime.consoleAPICalled") {
          const params = isRecord(message.params) ? message.params : {};
          logs.push({
            level: readNonEmptyString(params, "type") ?? "log",
            text: normalizeConsoleArguments(params.args),
            timestamp: typeof params.timestamp === "number" ? params.timestamp : undefined,
          });
        }
        if (message?.method === "Runtime.exceptionThrown") {
          const params = isRecord(message.params) ? message.params : {};
          logs.push(buildInspectorExceptionLogEntry(params));
        }
        if (logs.length >= maxLogs) {
          finish({
            status: "success",
            reasonCode: REASON_CODES.ok,
            sessionId,
            durationMs: Date.now() - startTime,
            attempts: 1,
            artifacts: [],
            data: {
              dryRun: false,
              metroBaseUrl,
              targetId: input.targetId,
              webSocketDebuggerUrl,
              collectedCount: logs.length,
              logs,
              summary: buildJsConsoleLogSummary(logs),
            },
            nextSuggestions: [],
          });
        }
      } catch {
        return;
      }
    });

    ws.addEventListener("error", () => {
      finish({
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          metroBaseUrl,
          targetId: input.targetId,
          webSocketDebuggerUrl,
          collectedCount: logs.length,
          logs,
          summary: buildJsConsoleLogSummary(logs),
        },
        nextSuggestions: ["Ensure the Metro inspector WebSocket is reachable and that the selected JS target is still attached."],
      });
    });
  });
}

export async function captureJsNetworkEventsWithMaestro(input: CaptureJsNetworkEventsInput): Promise<ToolResult<CaptureJsNetworkEventsData>> {
  const startTime = Date.now();
  const sessionId = input.sessionId ?? `js-network-events-${Date.now()}`;
  const metroBaseUrl = normalizeMetroBaseUrl(input.metroBaseUrl);
  const timeoutMs = normalizePositiveInteger(input.timeoutMs, DEFAULT_METRO_TIMEOUT_MS);
  const maxEvents = normalizePositiveInteger(input.maxEvents, DEFAULT_JS_NETWORK_MAX_EVENTS);
  const failuresOnly = input.failuresOnly ?? true;
  const webSocketDebuggerUrl = input.webSocketDebuggerUrl ?? (input.targetId ? buildInspectorWebSocketUrl(metroBaseUrl, input.targetId) : "");

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        metroBaseUrl,
        targetId: input.targetId,
        webSocketDebuggerUrl,
        collectedCount: 0,
        failuresOnly,
        events: [],
        summary: buildJsNetworkFailureSummary([]),
      },
      nextSuggestions: ["Run capture_js_network_events without dryRun while Metro inspector is available and provide targetId or webSocketDebuggerUrl."],
    };
  }

  if (!webSocketDebuggerUrl) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        metroBaseUrl,
        targetId: input.targetId,
        webSocketDebuggerUrl,
        collectedCount: 0,
        failuresOnly,
        events: [],
        summary: buildJsNetworkFailureSummary([]),
      },
      nextSuggestions: ["Call list_js_debug_targets first, then pass targetId or webSocketDebuggerUrl into capture_js_network_events."],
    };
  }

  const events = new Map<string, JsNetworkEvent>();
  const ws = new WebSocket(webSocketDebuggerUrl);

  return await new Promise<ToolResult<CaptureJsNetworkEventsData>>((resolve) => {
    let settled = false;
    let messageId = 1;
    const finish = (result: ToolResult<CaptureJsNetworkEventsData>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        return resolve(result);
      }
      resolve(result);
    };

    const snapshot = () => [...events.values()].filter((event) => shouldKeepNetworkEvent(event, failuresOnly)).slice(0, maxEvents);
    const timer = setTimeout(() => {
      const collected = snapshot();
      finish({
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          metroBaseUrl,
          targetId: input.targetId,
          webSocketDebuggerUrl,
          collectedCount: collected.length,
          failuresOnly,
          events: collected,
          summary: buildJsNetworkFailureSummary(collected),
        },
        nextSuggestions: collected.length === 0 ? ["No matching JS network events arrived before timeout. Confirm the target is active and issuing requests."] : [],
      });
    }, timeoutMs);
    unrefTimer(timer);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id: messageId++, method: "Network.enable" }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        const params = isRecord(message?.params) ? message.params : {};
        const requestId = readNonEmptyString(params, "requestId");
        if (!requestId) {
          return;
        }

        const current = events.get(requestId) ?? { requestId };
        if (message?.method === "Network.requestWillBeSent") {
          const request = isRecord(params.request) ? params.request : {};
          current.url = readNonEmptyString(request, "url") ?? current.url;
          current.method = readNonEmptyString(request, "method") ?? current.method;
        }
        if (message?.method === "Network.responseReceived") {
          const response = isRecord(params.response) ? params.response : {};
          current.url = readNonEmptyString(response, "url") ?? current.url;
          current.status = typeof response.status === "number" ? response.status : current.status;
          current.statusText = readNonEmptyString(response, "statusText") ?? current.statusText;
          current.mimeType = readNonEmptyString(response, "mimeType") ?? current.mimeType;
        }
        if (message?.method === "Network.loadingFailed") {
          current.errorText = readNonEmptyString(params, "errorText") ?? current.errorText;
        }

        events.set(requestId, current);

        if (snapshot().length >= maxEvents) {
          const collected = snapshot();
          finish({
            status: "success",
            reasonCode: REASON_CODES.ok,
            sessionId,
            durationMs: Date.now() - startTime,
            attempts: 1,
            artifacts: [],
            data: {
              dryRun: false,
              metroBaseUrl,
              targetId: input.targetId,
              webSocketDebuggerUrl,
              collectedCount: collected.length,
              failuresOnly,
              events: collected,
              summary: buildJsNetworkFailureSummary(collected),
            },
            nextSuggestions: [],
          });
        }
      } catch {
        return;
      }
    });

    ws.addEventListener("error", () => {
      finish({
        status: "failed",
        reasonCode: REASON_CODES.configurationError,
        sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          metroBaseUrl,
          targetId: input.targetId,
          webSocketDebuggerUrl,
          collectedCount: snapshot().length,
          failuresOnly,
          events: snapshot(),
          summary: buildJsNetworkFailureSummary(snapshot()),
        },
        nextSuggestions: ["Ensure the Metro inspector WebSocket is reachable and that the selected JS target is still attached."],
      });
    });
  });
}

export function classifyDebugSignal(line: string): DebugSignalSummary["category"] {
  const normalized = line.toLowerCase();
  if (normalized.includes("anr")) return "anr";
  if (normalized.includes("fatal") || normalized.includes("crash") || normalized.includes("androidruntime")) return "crash";
  if (normalized.includes("exception") || normalized.includes("traceback")) return "exception";
  if (normalized.includes("timeout")) return "timeout";
  if (normalized.includes("warn") || normalized.includes("warning")) return "warning";
  if (normalized.includes("error") || normalized.includes("err ")) return "error";
  return "other";
}
