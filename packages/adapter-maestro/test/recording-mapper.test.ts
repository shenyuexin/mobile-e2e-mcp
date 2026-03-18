import assert from "node:assert/strict";
import test from "node:test";
import type { RawRecordedEvent } from "@mobile-e2e-mcp/contracts";
import { mapRawEventsToRecordedSteps } from "../src/recording-mapper.ts";

function buildEvent(overrides: Partial<RawRecordedEvent>): RawRecordedEvent {
  return {
    eventId: overrides.eventId ?? "event-1",
    recordSessionId: overrides.recordSessionId ?? "rec-1",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    eventType: overrides.eventType ?? "tap",
    x: overrides.x,
    y: overrides.y,
    textDelta: overrides.textDelta,
    foregroundApp: overrides.foregroundApp,
    uiSnapshotRef: overrides.uiSnapshotRef,
    rawLine: overrides.rawLine,
  };
}

test("mapRawEventsToRecordedSteps maps tap to tap_element with auto wait", () => {
  const result = mapRawEventsToRecordedSteps("rec-1", [
    buildEvent({ eventId: "tap-1", eventType: "tap", x: 100, y: 200, uiSnapshotRef: "Login" }),
  ]);

  assert.equal(result.steps[0]?.actionType, "tap_element");
  assert.equal(result.steps[0]?.actionIntent?.actionType, "tap_element");
  assert.equal(result.steps[1]?.actionType, "wait_for_ui");
});

test("mapRawEventsToRecordedSteps maps type to type_into_element", () => {
  const result = mapRawEventsToRecordedSteps("rec-2", [
    buildEvent({ eventId: "type-1", eventType: "type", textDelta: "demo@example.com", uiSnapshotRef: "Email" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "type_into_element");
  assert.equal(result.steps[0]?.actionIntent?.value, "demo@example.com");
});

test("mapRawEventsToRecordedSteps maps app switch to launch_app", () => {
  const result = mapRawEventsToRecordedSteps("rec-3", [
    buildEvent({ eventId: "switch-1", eventType: "app_switch", foregroundApp: "com.example.app" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "launch_app");
  assert.equal(result.steps[0]?.actionIntent?.appId, "com.example.app");
});

test("mapRawEventsToRecordedSteps degrades tap without coordinates", () => {
  const result = mapRawEventsToRecordedSteps("rec-4", [
    buildEvent({ eventId: "tap-no-xy", eventType: "tap" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "tap");
  assert.equal(result.steps[0]?.confidence, "low");
});

test("mapRawEventsToRecordedSteps maps back to wait_for_ui", () => {
  const result = mapRawEventsToRecordedSteps("rec-5", [
    buildEvent({ eventId: "back-1", eventType: "back", uiSnapshotRef: "Catalog" }),
  ], { includeAutoWaitStep: false });

  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.actionType, "wait_for_ui");
});
