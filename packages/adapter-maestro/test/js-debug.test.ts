import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInspectorExceptionLogEntry,
  buildJsConsoleLogSummary,
  buildJsDebugTargetSelectionNarrativeLine,
  buildJsNetworkFailureSummary,
  buildJsNetworkSuspectSentences,
  rankJsDebugTarget,
  selectPreferredJsDebugTarget,
  selectPreferredJsDebugTargetWithReason,
} from "../src/js-debug.ts";

test("buildInspectorExceptionLogEntry extracts source and stack frames", () => {
  const entry = buildInspectorExceptionLogEntry({
    timestamp: 123,
    exceptionDetails: {
      text: "TypeError: undefined is not an object",
      url: "index.bundle",
      lineNumber: 42,
      columnNumber: 7,
      exception: {
        className: "TypeError",
        description: "TypeError: undefined is not an object (evaluating 'foo.bar')",
      },
      stackTrace: {
        callFrames: [
          { functionName: "renderScreen", url: "App.tsx", lineNumber: 10, columnNumber: 2 },
          { functionName: "performWork", url: "renderer.js", lineNumber: 88, columnNumber: 14 },
        ],
      },
    },
  });

  assert.equal(entry.level, "exception");
  assert.equal(entry.text, "TypeError: undefined is not an object");
  assert.equal(entry.timestamp, 123);
  assert.equal(entry.sourceUrl, "index.bundle");
  assert.equal(entry.lineNumber, 42);
  assert.equal(entry.columnNumber, 7);
  assert.equal(entry.exceptionId, undefined);
  assert.equal(entry.executionContextId, undefined);
  assert.equal(entry.exceptionType, "TypeError");
  assert.equal(entry.exceptionDescription, "TypeError: undefined is not an object (evaluating 'foo.bar')");
  assert.equal(entry.stackTraceText, "TypeError: undefined is not an object (evaluating 'foo.bar')");
  assert.equal(entry.stackFrameCount, 2);
  assert.equal(entry.stackFrames?.length, 2);
  assert.equal(entry.stackFrames?.[0]?.functionName, "renderScreen");
  assert.equal(entry.stackFrames?.[0]?.scriptId, undefined);
});

test("buildJsConsoleLogSummary counts exceptions by level", () => {
  const summary = buildJsConsoleLogSummary([
    { level: "log", text: "hello" },
    { level: "exception", text: "boom", exceptionType: "TypeError" },
    { level: "error", text: "bad" },
    { level: "exception", text: "crash", exceptionType: "RangeError" },
  ]);

  assert.equal(summary.totalLogs, 4);
  assert.equal(summary.exceptionCount, 2);
  assert.equal(summary.levelCounts.log, 1);
  assert.equal(summary.levelCounts.error, 1);
  assert.equal(summary.levelCounts.exception, 2);
});

test("buildJsNetworkFailureSummary groups failures by status error and host", () => {
  const summary = buildJsNetworkFailureSummary([
    { requestId: "1", url: "https://api.example.com/users", status: 500, errorText: "Server down" },
    { requestId: "2", url: "https://api.example.com/orders", status: 500 },
    { requestId: "3", url: "https://cdn.example.com/app.js", status: 404 },
    { requestId: "4", url: "https://api.example.com/timeout", errorText: "Timed out" },
    { requestId: "5", url: "https://ok.example.com/ok", status: 200 },
  ]);

  assert.equal(summary.totalTrackedRequests, 5);
  assert.equal(summary.failedRequestCount, 4);
  assert.equal(summary.clientErrors, 1);
  assert.equal(summary.serverErrors, 2);
  assert.equal(summary.networkErrors, 2);
  assert.equal(summary.statusGroups[0]?.key, "500");
  assert.equal(summary.statusGroups[0]?.count, 2);
  assert.equal(summary.errorGroups[0]?.key, "Server down");
  assert.equal(summary.hostGroups[0]?.key, "api.example.com");
  assert.equal(summary.hostGroups[0]?.count, 3);
});

test("buildJsNetworkSuspectSentences prioritizes host status and transport clues", () => {
  const suspects = buildJsNetworkSuspectSentences(buildJsNetworkFailureSummary([
    { requestId: "1", url: "https://api.example.com/users", status: 500, errorText: "Server down" },
    { requestId: "2", url: "https://api.example.com/orders", status: 500 },
    { requestId: "3", url: "https://cdn.example.com/app.js", errorText: "Timed out" },
  ]));

  assert.match(suspects[0] ?? "", /api\.example\.com/);
  assert.match(suspects[0] ?? "", /500/);
  assert.match(suspects[1] ?? "", /Server down|Timed out/);
});

test("selectPreferredJsDebugTarget prefers targets with a debugger websocket", () => {
  const selected = selectPreferredJsDebugTarget([
    { id: "first", title: "No socket" },
    { id: "second", title: "Debuggable", webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?target=second" },
  ]);

  assert.equal(selected?.id, "second");
});

test("selectPreferredJsDebugTarget falls back to the first target when needed", () => {
  const selected = selectPreferredJsDebugTarget([
    { id: "first", title: "Fallback" },
    { id: "second", title: "Later" },
  ]);

  assert.equal(selected?.id, "first");
});

test("selectPreferredJsDebugTarget prefers React Native and Expo metadata when multiple sockets exist", () => {
  const selected = selectPreferredJsDebugTarget([
    { id: "chrome", title: "Chrome debugger", webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?target=chrome" },
    { id: "expo", title: "Expo React Native Hermes", webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?target=expo" },
  ]);

  assert.equal(selected?.id, "expo");
});

test("rankJsDebugTarget explains why a target wins", () => {
  const ranked = rankJsDebugTarget({
    id: "expo",
    title: "Expo React Native Hermes",
    webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?target=expo",
  });

  assert.equal(ranked.score > 0, true);
  assert.equal(ranked.reason.includes("has websocket debugger URL"), true);
  assert.equal(ranked.reason.includes("mentions React Native"), true);
  assert.equal(ranked.reason.includes("mentions Expo"), true);
});

test("selectPreferredJsDebugTargetWithReason returns target and reason together", () => {
  const selection = selectPreferredJsDebugTargetWithReason([
    { id: "first", title: "Chrome debugger", webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?target=first" },
    { id: "second", title: "Expo React Native Hermes", webSocketDebuggerUrl: "ws://127.0.0.1:8081/inspector/debug?target=second" },
  ]);

  assert.equal(selection.target?.id, "second");
  assert.equal(selection.reason?.includes("mentions Expo"), true);
});

test("buildJsDebugTargetSelectionNarrativeLine includes reason when available", () => {
  const line = buildJsDebugTargetSelectionNarrativeLine(
    { id: "expo", title: "Expo React Native Hermes" },
    "has websocket debugger URL, mentions Expo",
  );

  assert.equal(line.includes("selected expo"), true);
  assert.equal(line.includes("Reason: has websocket debugger URL, mentions Expo."), true);
});

test("buildJsDebugTargetSelectionNarrativeLine handles missing target", () => {
  const line = buildJsDebugTargetSelectionNarrativeLine(undefined, undefined);

  assert.equal(line, "Metro target auto-discovery did not find a debuggable JS target.");
});
