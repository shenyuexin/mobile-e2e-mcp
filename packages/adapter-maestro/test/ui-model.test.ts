import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import {
  buildNonExecutedUiTargetResolution,
  buildScrollSwipeCoordinates,
  buildUiTargetResolution,
  buildInspectUiSummary,
  hasQueryUiSelector,
  isWaitConditionMet,
  normalizeQueryUiSelector,
  parseAndroidUiHierarchyNodes,
  parseIosInspectNodes,
  parseIosInspectSummary,
  parseUiBounds,
  queryUiNodes,
  reasonCodeForResolutionStatus,
  resolveFirstTapTarget,
  shouldAbortWaitForUiAfterReadFailure,
} from "../src/ui-model.ts";
import { buildCapabilityProfile, buildDiagnosisBriefing, buildLogSummary, collectDebugEvidenceWithMaestro, collectDiagnosticsWithMaestro, describeCapabilitiesWithMaestro, getCrashSignalsWithMaestro, getLogsWithMaestro, inspectUiWithMaestro, resolveUiTargetWithMaestro, scrollAndResolveUiTargetWithMaestro, scrollAndTapElementWithMaestro, takeScreenshotWithMaestro, tapElementWithMaestro, tapWithMaestro, typeIntoElementWithMaestro, typeTextWithMaestro, waitForUiWithMaestro } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function readFixture(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("parseAndroidUiHierarchyNodes builds stable nodes and summary from fixture", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const summary = buildInspectUiSummary(nodes);

  assert.equal(nodes.length, 6);
  assert.equal(summary.totalNodes, 6);
  assert.equal(summary.clickableNodes, 2);
  assert.equal(summary.nodesWithContentDesc, 5);
  assert.equal(summary.sampleNodes.length, 5);
  assert.equal(nodes[5]?.resourceId, "view_products_button");
  assert.equal(nodes[5]?.contentDesc, "View products");
});

test("queryUiNodes supports combined filters and preserves totalMatches under limit", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);

  const combined = queryUiNodes(nodes, normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true, limit: 1 }));
  assert.equal(combined.totalMatches, 2);
  assert.equal(combined.matches.length, 1);
  assert.deepEqual(combined.matches[0]?.matchedBy, ["className", "clickable"]);

  const byContentDesc = queryUiNodes(nodes, normalizeQueryUiSelector({ contentDesc: "View products" }));
  assert.equal(byContentDesc.totalMatches, 1);
  assert.equal(byContentDesc.matches[0]?.node.resourceId, "view_products_button");
  assert.deepEqual(byContentDesc.matches[0]?.matchedBy, ["contentDesc"]);
});

test("bounds parsing and first-target resolution produce structured coordinates", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const matches = queryUiNodes(nodes, normalizeQueryUiSelector({ resourceId: "view_products_button" })).matches;
  const resolved = resolveFirstTapTarget(matches);

  assert.equal(resolved.matchCount, 1);
  assert.equal(resolved.matchedNode?.resourceId, "view_products_button");
  assert.deepEqual(resolved.resolvedBounds, {
    left: 323,
    top: 1388,
    right: 757,
    bottom: 1514,
    width: 434,
    height: 126,
    center: { x: 540, y: 1451 },
  });
  assert.deepEqual(resolved.resolvedPoint, { x: 540, y: 1451 });

  assert.deepEqual(parseUiBounds("[32.5,140][192.5,188]"), {
    left: 32.5,
    top: 140,
    right: 192.5,
    bottom: 188,
    width: 160,
    height: 48,
    center: { x: 113, y: 164 },
  });
});

test("parseIosInspectSummary produces honest partial-ready summary from fixture", async () => {
  const json = await readFixture("tests/fixtures/ui/ios-sample.json");
  const summary = parseIosInspectSummary(json);

  assert.equal(summary.totalNodes, 5);
  assert.equal(summary.clickableNodes, 2);
  assert.equal(summary.scrollableNodes, 1);
  assert.equal(summary.nodesWithText, 2);
  assert.equal(summary.nodesWithContentDesc, 5);
  assert.ok(summary.sampleNodes.some((node) => node.resourceId === "signin_button"));
});

test("parseIosInspectNodes supports structured query and target resolution from fixture", async () => {
  const json = await readFixture("tests/fixtures/ui/ios-sample.json");
  const nodes = parseIosInspectNodes(json);
  const query = normalizeQueryUiSelector({ resourceId: "signin_button" });
  const result = { query, ...queryUiNodes(nodes, query) };
  const resolution = buildUiTargetResolution(query, result, "full");

  assert.equal(nodes.length, 5);
  assert.equal(result.totalMatches, 1);
  assert.equal(result.matches[0]?.node.resourceId, "signin_button");
  assert.equal(resolution.status, "resolved");
  assert.deepEqual(resolution.resolvedPoint, { x: 113, y: 164 });
});

test("parseIosInspectNodes detects ambiguous iOS selector matches", async () => {
  const json = await readFixture("tests/fixtures/ui/ios-sample.json");
  const nodes = parseIosInspectNodes(json);
  const query = normalizeQueryUiSelector({ clickable: true });
  const result = { query, ...queryUiNodes(nodes, query) };
  const resolution = buildUiTargetResolution(query, result, "full");

  assert.equal(result.totalMatches, 2);
  assert.equal(resolution.status, "ambiguous");
});

test("parseIosInspectSummary falls back to empty summary for invalid JSON", () => {
  const summary = parseIosInspectSummary("not-json");
  assert.equal(summary.totalNodes, 0);
  assert.equal(summary.sampleNodes.length, 0);
});

test("buildUiTargetResolution reports ambiguous and resolved states correctly", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);

  const ambiguousResult = { query: normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true, limit: 1 }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true, limit: 1 })) };
  const ambiguousResolution = buildUiTargetResolution(ambiguousResult.query, ambiguousResult, "full");
  assert.equal(ambiguousResolution.status, "ambiguous");
  assert.equal(ambiguousResolution.matchCount, 2);

  const resolvedResult = { query: normalizeQueryUiSelector({ resourceId: "view_products_button" }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ resourceId: "view_products_button" })) };
  const resolvedResolution = buildUiTargetResolution(resolvedResult.query, resolvedResult, "full");
  assert.equal(resolvedResolution.status, "resolved");
  assert.deepEqual(resolvedResolution.resolvedPoint, { x: 540, y: 1451 });
});

test("buildNonExecutedUiTargetResolution stays honest for full vs partial support", () => {
  const query = normalizeQueryUiSelector({ resourceId: "view_products_button" });
  assert.equal(buildNonExecutedUiTargetResolution(query, "full").status, "not_executed");
  assert.equal(buildNonExecutedUiTargetResolution(query, "partial").status, "unsupported");
});

test("reasonCodeForResolutionStatus maps detailed resolution outcomes", () => {
  assert.equal(reasonCodeForResolutionStatus("resolved"), "OK");
  assert.equal(reasonCodeForResolutionStatus("no_match"), "NO_MATCH");
  assert.equal(reasonCodeForResolutionStatus("ambiguous"), "AMBIGUOUS_MATCH");
  assert.equal(reasonCodeForResolutionStatus("missing_bounds"), "MISSING_BOUNDS");
  assert.equal(reasonCodeForResolutionStatus("not_executed"), "ADAPTER_ERROR");
  assert.equal(reasonCodeForResolutionStatus("unsupported"), "UNSUPPORTED_OPERATION");
});

test("isWaitConditionMet supports visible gone and unique modes", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);
  const visibleResult = { query: normalizeQueryUiSelector({ contentDesc: "View products" }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ contentDesc: "View products" })) };
  const ambiguousResult = { query: normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true }), ...queryUiNodes(nodes, normalizeQueryUiSelector({ className: "android.widget.Button", clickable: true })) };
  const missingResult = { query: normalizeQueryUiSelector({ contentDesc: "does not exist" }), totalMatches: 0, matches: [] };

  assert.equal(isWaitConditionMet(visibleResult, "visible"), true);
  assert.equal(isWaitConditionMet(ambiguousResult, "unique"), false);
  assert.equal(isWaitConditionMet(visibleResult, "unique"), true);
  assert.equal(isWaitConditionMet(missingResult, "gone"), true);
});

test("shouldAbortWaitForUiAfterReadFailure only aborts after repeated failures", () => {
  assert.equal(shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: 1, maxConsecutiveFailures: 2 }), false);
  assert.equal(shouldAbortWaitForUiAfterReadFailure({ consecutiveFailures: 2, maxConsecutiveFailures: 2 }), true);
});

test("buildScrollSwipeCoordinates uses viewport bounds and direction", async () => {
  const xml = await readFixture("tests/fixtures/ui/android-cart.xml");
  const nodes = parseAndroidUiHierarchyNodes(xml);

  assert.deepEqual(buildScrollSwipeCoordinates(nodes, "up", 250), {
    start: { x: 540, y: 1800 },
    end: { x: 540, y: 600 },
    durationMs: 250,
  });
  assert.deepEqual(buildScrollSwipeCoordinates(nodes, "down", 300), {
    start: { x: 540, y: 600 },
    end: { x: 540, y: 1800 },
    durationMs: 300,
  });
});

test("query selector normalization drops empty strings but keeps boolean filters", () => {
  const query = normalizeQueryUiSelector({ text: "", contentDesc: "View", clickable: false, limit: 2 });
  assert.equal(hasQueryUiSelector(query), true);
  assert.deepEqual(query, { contentDesc: "View", clickable: false, limit: 2 });
});

test("resolveUiTargetWithMaestro reports configuration errors without a selector", async () => {
  const result = await resolveUiTargetWithMaestro({
    sessionId: "test-session-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  const configResolution = result.data.resolution;
  assert.ok(configResolution);
  assert.equal(configResolution.status, "not_executed");
});

test("resolveUiTargetWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await resolveUiTargetWithMaestro({
    sessionId: "test-session-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const iosResolution = result.data.resolution;
  assert.ok(iosResolution);
  assert.equal(iosResolution.status, "not_executed");
});

test("resolveUiTargetWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await resolveUiTargetWithMaestro({
    sessionId: "test-session-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const dryRunResolution = result.data.resolution;
  assert.ok(dryRunResolution);
  assert.equal(dryRunResolution.status, "not_executed");
});

test("waitForUiWithMaestro reports configuration errors without a selector", async () => {
  const result = await waitForUiWithMaestro({
    sessionId: "test-wait-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
});

test("waitForUiWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await waitForUiWithMaestro({
    sessionId: "test-wait-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
});

test("waitForUiWithMaestro keeps Android dry-run as preview-only partial result", async () => {
  const result = await waitForUiWithMaestro({
    sessionId: "test-wait-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.polls, 0);
  assert.equal(result.data.result.totalMatches, 0);
});

test("buildLogSummary extracts top debug signals and honors query filtering", () => {
  const content = [
    "03-09 10:00:00.000 E AndroidRuntime: FATAL EXCEPTION: main",
    "03-09 10:00:00.100 E AndroidRuntime: java.lang.IllegalStateException: boom",
    "03-09 10:00:01.000 W ActivityTaskManager: timeout waiting for activity",
    "03-09 10:00:02.000 I ExampleTag: normal info",
  ].join("\n");

  const summary = buildLogSummary(content, "androidruntime");

  assert.equal(summary.totalLines, 4);
  assert.equal(summary.matchedLines, 2);
  assert.equal(summary.query, "androidruntime");
  assert.equal(summary.topSignals[0]?.category, "crash");
  assert.equal(summary.sampleLines.length, 2);
});

test("buildDiagnosisBriefing prioritizes suspects and packet status", () => {
  const briefing = buildDiagnosisBriefing({
    status: "partial",
    reasonCode: "DEVICE_UNAVAILABLE",
    appId: "host.exp.exponent",
    suspectAreas: ["Environment suspect: device or simulator connectivity prevented evidence capture."],
    jsDebugTargetId: undefined,
    jsConsoleLogCount: 0,
    jsNetworkEventCount: 0,
  });

  assert.equal(briefing[0], "Target app: host.exp.exponent.");
  assert.match(briefing[1] ?? "", /Environment suspect/);
  assert.match(briefing[briefing.length - 1] ?? "", /DEVICE_UNAVAILABLE/);
});

test("tapElementWithMaestro reports configuration errors without a selector", async () => {
  const result = await tapElementWithMaestro({
    sessionId: "test-tap-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  const configResolution = result.data.resolution;
  assert.ok(configResolution);
  assert.equal(configResolution.status, "not_executed");
});

test("tapElementWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await tapElementWithMaestro({
    sessionId: "test-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const iosResolution = result.data.resolution;
  assert.ok(iosResolution);
  assert.equal(iosResolution.status, "not_executed");
});

test("tapElementWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await tapElementWithMaestro({
    sessionId: "test-tap-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  const dryRunResolution = result.data.resolution;
  assert.ok(dryRunResolution);
  assert.equal(dryRunResolution.status, "not_executed");
});

test("typeIntoElementWithMaestro reports configuration errors without a selector", async () => {
  const result = await typeIntoElementWithMaestro({
    sessionId: "test-type-config",
    platform: "android",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("typeIntoElementWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await typeIntoElementWithMaestro({
    sessionId: "test-type-ios",
    platform: "ios",
    contentDesc: "View products",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("typeIntoElementWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await typeIntoElementWithMaestro({
    sessionId: "test-type-dry-run",
    platform: "android",
    contentDesc: "View products",
    value: "hello",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("scrollAndResolveUiTargetWithMaestro reports configuration errors without a selector", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-config",
    platform: "android",
    dryRun: true,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reasonCode, "CONFIGURATION_ERROR");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("scrollAndResolveUiTargetWithMaestro previews iOS swipe-assisted dry-run", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("scrollAndResolveUiTargetWithMaestro keeps Android dry-run as not_executed preview", async () => {
  const result = await scrollAndResolveUiTargetWithMaestro({
    sessionId: "test-scroll-dry-run",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolution.status, "not_executed");
});

test("buildCapabilityProfile stays honest across Android and iOS UI action support", () => {
  const androidProfile = buildCapabilityProfile("android", "phase1");
  const iosProfile = buildCapabilityProfile("ios", "phase1");

  assert.equal(androidProfile.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "tap")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "type_text")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "tap_element")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "type_into_element")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "wait_for_ui")?.supportLevel, "full");
  assert.equal(iosProfile.toolCapabilities.find((tool) => tool.toolName === "scroll_and_resolve_ui_target")?.supportLevel, "full");
  assert.equal(iosProfile.groups.find((group) => group.groupName === "ui_actions")?.supportLevel, "full");
});

test("typeTextWithMaestro previews iOS idb text entry in dry-run mode", async () => {
  const result = await typeTextWithMaestro({
    sessionId: "test-type-text-ios",
    platform: "ios",
    text: "hello world",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.deepEqual(result.data.command.slice(1), ["ui", "text", "hello world", "--udid", "ADA078B9-3C6B-4875-8B85-A7789F368816"]);
  assert.equal(result.data.exitCode, 0);
});

test("tapWithMaestro previews iOS idb coordinate tap in dry-run mode", async () => {
  const result = await tapWithMaestro({
    sessionId: "test-tap-ios-direct",
    platform: "ios",
    x: 10,
    y: 20,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.deepEqual(result.data.command.slice(1), ["ui", "tap", "10", "20", "--udid", "ADA078B9-3C6B-4875-8B85-A7789F368816"]);
  assert.equal(result.data.exitCode, 0);
});

test("describeCapabilitiesWithMaestro returns a capability profile", async () => {
  const result = await describeCapabilitiesWithMaestro({
    sessionId: "capabilities-test",
    platform: "ios",
    runnerProfile: "phase1",
  });

  assert.equal(result.status, "success");
  assert.equal(result.reasonCode, "OK");
  assert.equal(result.data.capabilities.platform, "ios");
  assert.equal(result.data.capabilities.toolCapabilities.find((tool) => tool.toolName === "inspect_ui")?.supportLevel, "partial");
});

test("scrollAndTapElementWithMaestro keeps iOS partial and unsupported", async () => {
  const result = await scrollAndTapElementWithMaestro({
    sessionId: "test-scroll-tap-ios",
    platform: "ios",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolveResult.resolution.status, "not_executed");
});

test("scrollAndTapElementWithMaestro keeps Android dry-run as preview-only partial result", async () => {
  const result = await scrollAndTapElementWithMaestro({
    sessionId: "test-scroll-tap-android",
    platform: "android",
    contentDesc: "View products",
    dryRun: true,
  });

  assert.equal(result.status, "partial");
  assert.equal(result.reasonCode, "UNSUPPORTED_OPERATION");
  assert.equal(result.data.supportLevel, "full");
  assert.equal(result.data.resolveResult.resolution.status, "not_executed");
});

test("artifact-heavy dry-run tools emit structured evidence", async () => {
  const screenshotResult = await takeScreenshotWithMaestro({ sessionId: "evidence-screenshot", platform: "android", dryRun: true });
  const inspectResult = await inspectUiWithMaestro({ sessionId: "evidence-inspect", platform: "android", dryRun: true });
  const logsResult = await getLogsWithMaestro({ sessionId: "evidence-logs", platform: "android", dryRun: true, query: "error" });
  const crashResult = await getCrashSignalsWithMaestro({ sessionId: "evidence-crash", platform: "android", dryRun: true });
  const diagnosticsResult = await collectDiagnosticsWithMaestro({ sessionId: "evidence-diagnostics", platform: "android", dryRun: true });

  assert.equal(screenshotResult.data.evidence?.[0]?.kind, "screenshot");
  assert.equal(inspectResult.data.evidence?.[0]?.kind, "ui_dump");
  assert.equal(logsResult.data.evidence?.[0]?.kind, "log");
  assert.equal(logsResult.data.evidence?.[0]?.path, logsResult.data.outputPath);
  assert.equal(crashResult.data.evidence?.[0]?.kind, "crash_signal");
  assert.equal(diagnosticsResult.data.evidence?.[0]?.kind, "diagnostics_bundle");
});

test("collectDebugEvidenceWithMaestro aggregates structured evidence in dry-run mode", async () => {
  const result = await collectDebugEvidenceWithMaestro({
    sessionId: "evidence-debug-summary",
    platform: "android",
    query: "error",
    includeDiagnostics: true,
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.jsConsoleSummary?.totalLogs, 0);
  assert.equal(result.data.jsConsoleSummary?.exceptionCount, 0);
  assert.equal(result.data.jsNetworkSummary?.totalTrackedRequests, 0);
  assert.equal(result.data.jsNetworkSummary?.failedRequestCount, 0);
  assert.equal(result.data.evidence?.some((item) => item.kind === "log"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "crash_signal"), true);
  assert.equal(result.data.evidence?.some((item) => item.kind === "diagnostics_bundle"), true);
});

test("collectDebugEvidenceWithMaestro carries custom metro base url into auto discovery metadata", async () => {
  const result = await collectDebugEvidenceWithMaestro({
    sessionId: "evidence-custom-metro",
    platform: "android",
    metroBaseUrl: "http://127.0.0.1:9090",
    dryRun: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.jsDebugMetroBaseUrl, "http://127.0.0.1:9090");
  assert.equal(result.data.jsDebugTargetEndpoint, "http://127.0.0.1:9090/json/list");
  assert.equal(result.data.jsDebugTargetCandidateCount, 0);
  assert.equal(result.data.jsDebugTargetSelectionReason, undefined);
  assert.equal(result.data.jsConsoleSummary?.totalLogs, 0);
  assert.equal(result.data.jsConsoleSummary?.exceptionCount, 0);
  assert.equal(result.data.jsNetworkSummary?.totalTrackedRequests, 0);
  assert.equal(result.data.jsNetworkSummary?.failedRequestCount, 0);
});
