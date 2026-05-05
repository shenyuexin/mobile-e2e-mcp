import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Platform } from "@mobile-e2e-mcp/contracts";
import { coreEvidencePaths, legacyCoreEvidencePaths } from "./output-paths.js";

export type DeviceLeaseState = "leased" | "busy";

export interface DeviceLease {
  leaseId: string;
  sessionId: string;
  platform: Platform;
  deviceId: string;
  state: DeviceLeaseState;
  ownerPid: number;
  acquiredAt: string;
  heartbeatAt: string;
  coordinationKey?: string;
  barrierId?: string;
}

export interface DeviceLeaseConflict {
  reason: "busy" | "unavailable";
  lease?: DeviceLease;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertSafeSegment(input: string, label: string): void {
  if (!/^[A-Za-z0-9._:-]+$/.test(input)) {
    throw new Error(`Invalid ${label} for lease persistence: ${input}`);
  }
}

function isDeviceLease(value: unknown): value is DeviceLease {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.leaseId === "string"
    && typeof value.sessionId === "string"
    && (value.platform === "android" || value.platform === "ios")
    && typeof value.deviceId === "string"
    && (value.state === "leased" || value.state === "busy")
    && typeof value.ownerPid === "number"
    && Number.isFinite(value.ownerPid)
    && typeof value.acquiredAt === "string"
    && typeof value.heartbeatAt === "string"
    && (typeof value.coordinationKey === "undefined" || typeof value.coordinationKey === "string")
    && (typeof value.barrierId === "undefined" || typeof value.barrierId === "string");
}

export function buildDeviceLeaseRecordRelativePath(platform: Platform, deviceId: string): string {
  assertSafeSegment(platform, "platform");
  assertSafeSegment(deviceId, "deviceId");
  return path.posix.join(coreEvidencePaths.leases(), `${platform}-${deviceId}.json`);
}

function buildLegacyDeviceLeaseRecordRelativePath(platform: Platform, deviceId: string): string {
  assertSafeSegment(platform, "platform");
  assertSafeSegment(deviceId, "deviceId");
  return path.posix.join(legacyCoreEvidencePaths.leases(), `${platform}-${deviceId}.json`);
}

function buildDeviceLeaseRecordAbsolutePath(repoRoot: string, platform: Platform, deviceId: string): string {
  return path.resolve(repoRoot, buildDeviceLeaseRecordRelativePath(platform, deviceId));
}

function buildLeaseDirectoryAbsolutePath(repoRoot: string): string {
  return path.resolve(repoRoot, coreEvidencePaths.leases());
}

function buildLegacyLeaseDirectoryAbsolutePath(repoRoot: string): string {
  return path.resolve(repoRoot, legacyCoreEvidencePaths.leases());
}

function buildLegacyDeviceLeaseRecordAbsolutePath(repoRoot: string, platform: Platform, deviceId: string): string {
  return path.resolve(repoRoot, buildLegacyDeviceLeaseRecordRelativePath(platform, deviceId));
}

async function writeJsonFile(absolutePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const tempPath = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, absolutePath);
  } catch (error: unknown) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function loadLeaseByDevice(repoRoot: string, platform: Platform, deviceId: string): Promise<DeviceLease | undefined> {
  for (const absolutePath of [
    buildDeviceLeaseRecordAbsolutePath(repoRoot, platform, deviceId),
    buildLegacyDeviceLeaseRecordAbsolutePath(repoRoot, platform, deviceId),
  ]) {
    try {
      const content = await readFile(absolutePath, "utf8");
      const parsed: unknown = JSON.parse(content);
      if (!isDeviceLease(parsed)) {
        return undefined;
      }
      return parsed;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      if (error instanceof SyntaxError) {
        return undefined;
      }
      throw error;
    }
  }
  return undefined;
}

export async function persistLease(repoRoot: string, lease: DeviceLease): Promise<string> {
  const relativePath = buildDeviceLeaseRecordRelativePath(lease.platform, lease.deviceId);
  const absolutePath = buildDeviceLeaseRecordAbsolutePath(repoRoot, lease.platform, lease.deviceId);
  await writeJsonFile(absolutePath, lease);
  return relativePath;
}

export async function removeLease(repoRoot: string, platform: Platform, deviceId: string): Promise<{ removed: boolean; relativePath: string }> {
  const relativePath = buildDeviceLeaseRecordRelativePath(platform, deviceId);
  const absolutePath = buildDeviceLeaseRecordAbsolutePath(repoRoot, platform, deviceId);
  try {
    await unlink(absolutePath);
    return { removed: true, relativePath };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { removed: false, relativePath };
    }
    throw error;
  }
}

export async function listLeases(repoRoot: string): Promise<DeviceLease[]> {
  const seenLeaseKeys = new Set<string>();
  const directories = [
    buildLeaseDirectoryAbsolutePath(repoRoot),
    buildLegacyLeaseDirectoryAbsolutePath(repoRoot),
  ];
  const leases: DeviceLease[] = [];
  for (const directoryPath of directories) {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const absolutePath = path.resolve(directoryPath, entry.name);
      try {
        const parsed: unknown = JSON.parse(await readFile(absolutePath, "utf8"));
        if (isDeviceLease(parsed)) {
          const leaseKey = `${parsed.platform}:${parsed.deviceId}`;
          if (seenLeaseKeys.has(leaseKey)) {
            continue;
          }
          seenLeaseKeys.add(leaseKey);
          leases.push(parsed);
        }
      } catch {
      }
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      continue;
    }
    throw error;
  }
  }
  return leases;
}
