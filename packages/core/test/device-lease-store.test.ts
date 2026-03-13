import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceLeaseRecordRelativePath, listLeases, loadLeaseByDevice, persistLease, removeLease } from "../src/device-lease-store.ts";
import type { DeviceLease } from "../src/device-lease-store.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function cleanupLease(platform: "android" | "ios", deviceId: string): Promise<void> {
  await rm(path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId)), { force: true });
}

test("device lease store persists, loads, lists, and removes lease records", async () => {
  const deviceId = `core-lease-device-${Date.now()}`;
  const sessionId = `core-lease-session-${Date.now()}`;
  const baseLease: DeviceLease = {
    leaseId: `lease-${Date.now()}`,
    sessionId,
    platform: "android",
    deviceId,
    state: "leased",
    ownerPid: process.pid,
    acquiredAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };

  await cleanupLease("android", deviceId);
  try {
    const relativePath = await persistLease(repoRoot, baseLease);
    assert.equal(relativePath, buildDeviceLeaseRecordRelativePath("android", deviceId));

    const loaded = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(loaded?.sessionId, sessionId);
    assert.equal(loaded?.state, "leased");

    const updatedLease: DeviceLease = {
      ...baseLease,
      state: "busy",
      heartbeatAt: new Date(Date.now() + 1000).toISOString(),
      coordinationKey: "room-1",
      barrierId: "barrier-1",
    };
    await persistLease(repoRoot, updatedLease);

    const reloaded = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(reloaded?.state, "busy");
    assert.equal(reloaded?.coordinationKey, "room-1");
    assert.equal(reloaded?.barrierId, "barrier-1");

    const leases = await listLeases(repoRoot);
    assert.equal(leases.some((lease) => lease.deviceId === deviceId && lease.sessionId === sessionId), true);

    const removed = await removeLease(repoRoot, "android", deviceId);
    assert.equal(removed.removed, true);
    const afterRemove = await loadLeaseByDevice(repoRoot, "android", deviceId);
    assert.equal(afterRemove, undefined);

    const removedAgain = await removeLease(repoRoot, "android", deviceId);
    assert.equal(removedAgain.removed, false);
  } finally {
    await cleanupLease("android", deviceId);
  }
});
