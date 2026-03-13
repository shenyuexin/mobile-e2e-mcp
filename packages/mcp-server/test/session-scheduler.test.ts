import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath, loadLeaseByDevice, loadSessionRecord } from "@mobile-e2e-mcp/core";
import { createServer } from "../src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionAndLease(sessionId: string, platform: "android" | "ios", deviceId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId)), { force: true });
}

test("session-bound tools for same session are serialized and emit queue events", async () => {
  const server = createServer();
  const sessionId = `session-scheduler-single-${Date.now()}`;
  const deviceId = `session-scheduler-device-${Date.now()}`;
  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    const started = await server.invoke("start_session", {
      sessionId,
      platform: "android",
      deviceId,
      profile: "phase1",
    });
    assert.equal(started.status, "success");

    const [first, second] = await Promise.all([
      server.invoke("get_logs", { sessionId, platform: "android", dryRun: true, lines: 20 }),
      server.invoke("get_logs", { sessionId, platform: "android", dryRun: true, lines: 40 }),
    ]);

    assert.equal(first.status, "success");
    assert.equal(second.status, "success");

    const firstData = (first.data ?? {}) as { queueWaitMs?: number };
    const secondData = (second.data ?? {}) as { queueWaitMs?: number };
    assert.equal(typeof firstData.queueWaitMs, "number");
    assert.equal(typeof secondData.queueWaitMs, "number");

    const sessionRecord = await loadSessionRecord(repoRoot, sessionId);
    assert.equal((sessionRecord?.session.timeline.filter((event) => event.type === "queue_wait_started").length ?? 0) >= 1, true);
    assert.equal((sessionRecord?.session.timeline.filter((event) => event.type === "queue_wait_ended").length ?? 0) >= 1, true);
  } finally {
    await server.invoke("end_session", { sessionId }).catch(() => undefined);
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});

test("different devices can run session-bound tools concurrently", async () => {
  const server = createServer();
  const sessionA = `session-scheduler-a-${Date.now()}`;
  const sessionB = `session-scheduler-b-${Date.now()}`;
  const deviceA = `session-scheduler-device-a-${Date.now()}`;
  const deviceB = `session-scheduler-device-b-${Date.now()}`;

  await cleanupSessionAndLease(sessionA, "android", deviceA);
  await cleanupSessionAndLease(sessionB, "android", deviceB);

  try {
    assert.equal((await server.invoke("start_session", { sessionId: sessionA, platform: "android", deviceId: deviceA, profile: "phase1" })).status, "success");
    assert.equal((await server.invoke("start_session", { sessionId: sessionB, platform: "android", deviceId: deviceB, profile: "phase1" })).status, "success");

    const [resultA, resultB] = await Promise.all([
      server.invoke("get_logs", { sessionId: sessionA, platform: "android", dryRun: true, lines: 10 }),
      server.invoke("get_logs", { sessionId: sessionB, platform: "android", dryRun: true, lines: 30 }),
    ]);

    assert.equal(resultA.status, "success");
    assert.equal(resultB.status, "success");
  } finally {
    await server.invoke("end_session", { sessionId: sessionA }).catch(() => undefined);
    await server.invoke("end_session", { sessionId: sessionB }).catch(() => undefined);
    await cleanupSessionAndLease(sessionA, "android", deviceA);
    await cleanupSessionAndLease(sessionB, "android", deviceB);
  }
});

test("session-bound tool failure path keeps lease recoverable for subsequent calls", async () => {
  const server = createServer();
  const sessionId = `session-scheduler-failure-${Date.now()}`;
  const deviceId = `session-scheduler-failure-device-${Date.now()}`;
  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    assert.equal((await server.invoke("start_session", { sessionId, platform: "android", deviceId, profile: "phase1" })).status, "success");

    await server.invoke("recover_to_known_state", {
      sessionId,
      platform: "android",
      dryRun: true,
    });

    const lease = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(lease?.state, "leased");

    const nextResult = await server.invoke("get_logs", { sessionId, platform: "android", dryRun: true, lines: 15 });
    assert.equal(nextResult.status, "success");
  } finally {
    await server.invoke("end_session", { sessionId }).catch(() => undefined);
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});
