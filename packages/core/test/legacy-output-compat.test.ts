import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { DeviceLease, PersistedActionRecord, PersistedRecordSession } from "../src/index.ts";
import {
  coreEvidencePaths,
  legacyCoreEvidencePaths,
  listActionRecordsForSession,
  listRawRecordedEvents,
  loadBaselineIndex,
  loadFailureIndex,
  loadLatestActionRecordForSession,
  loadRecordedSteps,
  loadRecordSession,
} from "../src/index.ts";
import { listLeases } from "../src/device-lease-store.ts";

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeRepoRoot(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), "m2e-legacy-output-"));
}

test("action record discovery includes legacy artifacts/actions records", async () => {
  const repoRoot = await makeRepoRoot();
  const sessionId = "legacy-action-session";
  const older: PersistedActionRecord = {
    actionId: "legacy-action-older",
    sessionId,
    outcome: {
      actionId: "legacy-action-older",
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      preState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
      postState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      confidence: 1,
      outcome: "success",
    },
    evidenceDelta: {},
    evidence: [],
    lowLevelStatus: "success",
    lowLevelReasonCode: "OK",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const newer: PersistedActionRecord = {
    ...older,
    actionId: "legacy-action-newer",
    outcome: { ...older.outcome, actionId: "legacy-action-newer" },
    updatedAt: "2026-01-01T00:00:01.000Z",
  };

  try {
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.actions(), `${older.actionId}.json`), older);
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.actions(), `${newer.actionId}.json`), newer);

    const records = await listActionRecordsForSession(repoRoot, sessionId);
    assert.deepEqual(records.map((record) => record.actionId), ["legacy-action-newer", "legacy-action-older"]);
    assert.equal((await loadLatestActionRecordForSession(repoRoot, sessionId))?.actionId, "legacy-action-newer");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("action record discovery prefers output/evidence over legacy duplicates", async () => {
  const repoRoot = await makeRepoRoot();
  const sessionId = "duplicate-action-session";
  const current: PersistedActionRecord = {
    actionId: "shared-action",
    sessionId,
    outcome: {
      actionId: "shared-action",
      actionType: "tap_element",
      resolutionStrategy: "deterministic",
      preState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
      postState: { appPhase: "ready", readiness: "ready", blockingSignals: [] },
      stateChanged: false,
      fallbackUsed: false,
      retryCount: 0,
      confidence: 1,
      outcome: "success",
    },
    evidenceDelta: {},
    evidence: [],
    lowLevelStatus: "success",
    lowLevelReasonCode: "OK",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const legacyDuplicate: PersistedActionRecord = {
    ...current,
    updatedAt: "2026-01-01T00:00:02.000Z",
  };
  const legacyOnly: PersistedActionRecord = {
    ...current,
    actionId: "legacy-only-action",
    outcome: { ...current.outcome, actionId: "legacy-only-action" },
    updatedAt: "2026-01-01T00:00:01.000Z",
  };

  try {
    await writeJson(path.resolve(repoRoot, coreEvidencePaths.actions(), `${current.actionId}.json`), current);
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.actions(), `${legacyDuplicate.actionId}.json`), legacyDuplicate);
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.actions(), `${legacyOnly.actionId}.json`), legacyOnly);

    const records = await listActionRecordsForSession(repoRoot, sessionId);
    assert.deepEqual(records.map((record) => record.actionId), ["legacy-only-action", "shared-action"]);
    assert.equal(records.find((record) => record.actionId === "shared-action")?.updatedAt, current.updatedAt);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("listLeases includes legacy artifacts/leases records", async () => {
  const repoRoot = await makeRepoRoot();
  const lease: DeviceLease = {
    leaseId: "legacy-lease",
    sessionId: "legacy-lease-session",
    platform: "android",
    deviceId: "legacy-device",
    state: "leased",
    ownerPid: process.pid,
    acquiredAt: "2026-01-01T00:00:00.000Z",
    heartbeatAt: "2026-01-01T00:00:00.000Z",
  };

  try {
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.leases(), "android-legacy-device.json"), lease);

    const leases = await listLeases(repoRoot);
    assert.equal(leases.some((item) => item.leaseId === lease.leaseId), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("recording store loads legacy record session, raw events, and recorded steps", async () => {
  const repoRoot = await makeRepoRoot();
  const recordSessionId = "legacy-record-session";
  const recordSession: PersistedRecordSession = {
    recordSessionId,
    sessionId: "legacy-session",
    platform: "android",
    deviceId: "legacy-device",
    appId: "com.example",
    recordingProfile: "default",
    status: "ended",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:02.000Z",
    captureChannels: ["input"],
    rawEventsPath: `${legacyCoreEvidencePaths.recordEvents()}/${recordSessionId}.jsonl`,
    warnings: [],
    updatedAt: "2026-01-01T00:00:02.000Z",
  };
  const rawEvent = {
    eventId: "legacy-event-1",
    recordSessionId,
    timestamp: "2026-01-01T00:00:01.000Z",
    eventType: "tap",
    x: 1,
    y: 2,
  };
  const recordedStep = {
    stepNumber: 1,
    eventId: rawEvent.eventId,
    timestamp: rawEvent.timestamp,
    actionType: "tap",
    x: 1,
    y: 2,
    confidence: "high",
    reason: "legacy fixture",
  };

  try {
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.recordSessions(), `${recordSessionId}.json`), recordSession);
    await mkdir(path.resolve(repoRoot, legacyCoreEvidencePaths.recordEvents()), { recursive: true });
    await writeFile(path.resolve(repoRoot, legacyCoreEvidencePaths.recordEvents(), `${recordSessionId}.jsonl`), `${JSON.stringify(rawEvent)}\n`, "utf8");
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.recordedSteps(), `${recordSessionId}.json`), [recordedStep]);

    assert.equal((await loadRecordSession(repoRoot, recordSessionId))?.recordSessionId, recordSessionId);
    assert.equal((await listRawRecordedEvents(repoRoot, recordSessionId)).length, 1);
    assert.equal((await loadRecordedSteps(repoRoot, recordSessionId)).length, 1);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("failure memory loads legacy ai-first indexes", async () => {
  const repoRoot = await makeRepoRoot();
  try {
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.aiFirst(), "failure-index.json"), [
      {
        actionId: "legacy-failure-action",
        sessionId: "legacy-session",
        signature: { actionType: "tap_element", reasonCode: "NO_MATCH" },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    await writeJson(path.resolve(repoRoot, legacyCoreEvidencePaths.aiFirst(), "baseline-index.json"), [
      {
        actionId: "legacy-baseline-action",
        sessionId: "legacy-session",
        actionType: "tap_element",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    assert.equal((await loadFailureIndex(repoRoot))[0]?.actionId, "legacy-failure-action");
    assert.equal((await loadBaselineIndex(repoRoot))[0]?.actionId, "legacy-baseline-action");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
