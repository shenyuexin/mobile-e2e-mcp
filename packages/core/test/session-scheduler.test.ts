import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { acquireLease, buildDeviceLeaseRecordRelativePath, buildSessionAuditRelativePath, buildSessionRecordRelativePath, loadLeaseByDevice, loadSessionRecord, persistLease, persistStartedSession, recoverStaleLeases, removeLease, runExclusive } from "../src/index.ts";
import type { Session } from "@mobile-e2e-mcp/contracts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupSessionAndLease(sessionId: string, platform: "android" | "ios", deviceId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildSessionRecordRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildSessionAuditRelativePath(sessionId)), { force: true });
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId)), { force: true });
}

function buildSession(sessionId: string, deviceId: string): Session {
  return {
    sessionId,
    platform: "android",
    deviceId,
    appId: "host.exp.exponent",
    policyProfile: "sample-harness-default",
    startedAt: new Date().toISOString(),
    artifactsRoot: "artifacts",
    timeline: [],
    profile: "phase1",
    phase: "phase2",
    sampleName: "sample-maestro-flow",
  };
}

test("runExclusive serializes same-session tasks and restores lease state", async () => {
  const sessionId = `core-scheduler-${Date.now()}`;
  const deviceId = `core-scheduler-device-${Date.now()}`;
  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    await persistStartedSession(repoRoot, buildSession(sessionId, deviceId));
    const leaseResult = await acquireLease(repoRoot, {
      sessionId,
      platform: "android",
      deviceId,
    });
    assert.equal(leaseResult.acquired, true);

    const order: string[] = [];
    const firstTask = runExclusive(
      {
        repoRoot,
        sessionId,
        platform: "android",
        deviceId,
        toolName: "test_first",
      },
      async () => {
        order.push("first:start");
        await new Promise((resolve) => setTimeout(resolve, 35));
        order.push("first:end");
        return "first";
      },
    );

    const secondTask = runExclusive(
      {
        repoRoot,
        sessionId,
        platform: "android",
        deviceId,
        toolName: "test_second",
      },
      async () => {
        order.push("second:start");
        order.push("second:end");
        return "second";
      },
    );

    const [first, second] = await Promise.all([firstTask, secondTask]);
    assert.equal(first.value, "first");
    assert.equal(second.value, "second");
    assert.equal(order.length, 4);
    const firstStartIndex = order.indexOf("first:start");
    const firstEndIndex = order.indexOf("first:end");
    const secondStartIndex = order.indexOf("second:start");
    const secondEndIndex = order.indexOf("second:end");
    assert.equal(firstStartIndex >= 0 && firstEndIndex > firstStartIndex, true);
    assert.equal(secondStartIndex >= 0 && secondEndIndex > secondStartIndex, true);
    const firstFinishesBeforeSecondStarts = firstEndIndex < secondStartIndex;
    const secondFinishesBeforeFirstStarts = secondEndIndex < firstStartIndex;
    assert.equal(firstFinishesBeforeSecondStarts || secondFinishesBeforeFirstStarts, true);

    const lease = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(lease?.state, "leased");

    const sessionRecord = await loadSessionRecord(repoRoot, sessionId);
    assert.equal((sessionRecord?.session.timeline.filter((event) => event.type === "queue_wait_started").length ?? 0) >= 1, true);
    assert.equal((sessionRecord?.session.timeline.filter((event) => event.type === "queue_wait_ended").length ?? 0) >= 1, true);
  } finally {
    await removeLease(repoRoot, "android", deviceId);
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});

test("recoverStaleLeases removes stale lease records", async () => {
  const sessionId = `core-stale-${Date.now()}`;
  const deviceId = `core-stale-device-${Date.now()}`;
  await cleanupSessionAndLease(sessionId, "android", deviceId);

  try {
    await persistLease(repoRoot, {
      leaseId: `lease-${Date.now()}`,
      sessionId,
      platform: "android",
      deviceId,
      state: "leased",
      ownerPid: process.pid,
      acquiredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      heartbeatAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const recovered = await recoverStaleLeases(repoRoot, 60 * 1000);
    assert.equal(recovered.recovered.some((lease) => lease.deviceId === deviceId), true);

    const remaining = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(remaining, undefined);
  } finally {
    await cleanupSessionAndLease(sessionId, "android", deviceId);
  }
});
