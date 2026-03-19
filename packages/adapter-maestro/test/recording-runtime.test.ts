import assert from "node:assert/strict";
import test from "node:test";
import { recordingRuntimeInternals } from "../src/recording-runtime.ts";

test("chooseNearestSnapshotRef prefers pre-action snapshot when available", () => {
  const selected = recordingRuntimeInternals.chooseNearestSnapshotRef(new Date(1773885602500).toISOString(), [
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml", capturedAtMs: 1773885601000 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885602600.xml", capturedAtMs: 1773885602600 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885604000.xml", capturedAtMs: 1773885604000 },
  ]);

  assert.equal(selected, "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml");
});

test("chooseNearestSnapshotRef falls back to earliest snapshot when no pre-action snapshot exists", () => {
  const selected = recordingRuntimeInternals.chooseNearestSnapshotRef(new Date(1773885600500).toISOString(), [
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml", capturedAtMs: 1773885601000 },
    { ref: "artifacts/record-snapshots/rec-1/rec-1-1773885602600.xml", capturedAtMs: 1773885602600 },
  ]);

  assert.equal(selected, "artifacts/record-snapshots/rec-1/rec-1-1773885601000.xml");
});

test("mapMonotonicToIso anchors with capture start monotonic clock", () => {
  const timestamp = recordingRuntimeInternals.mapMonotonicToIso(
    "2026-03-19T10:00:00.000Z",
    1_100_000,
    1_000_000,
  );

  assert.equal(timestamp, "2026-03-19T10:01:40.000Z");
});

test("parseSnapshotCapturedAtMs extracts epoch millis from snapshot ref", () => {
  const parsed = recordingRuntimeInternals.parseSnapshotCapturedAtMs(
    "artifacts/record-snapshots/rec-1/rec-1-1773885602600.xml",
  );

  assert.equal(parsed, 1773885602600);
});
