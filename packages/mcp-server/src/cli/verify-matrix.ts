import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Platform, RunnerProfile } from "@mobile-e2e-mcp/contracts";

export interface VerifyMatrixTargetSpec {
  label: string;
  platform: Platform;
  deviceId?: string;
  appId?: string;
  runnerProfile?: RunnerProfile;
  baselinePath?: string;
  probeConfig?: string;
}

export interface VerifyMatrixConfigFile {
  targets: VerifyMatrixTargetSpec[];
}

export interface VerifyMatrixTargetSummary {
  label: string;
  platform: Platform;
  deviceId?: string;
  overallStatus: "passed" | "failed";
  durationMs: number;
  flowsPassed: number;
  flowsTotal: number;
  auditStatus: string;
  probeStatus: string;
  explorerStatus: string;
  summaryJsonRelPath: string;
  reportHtmlRelPath: string;
  failurePacketRelPath?: string;
}

export interface VerifyMatrixSummary {
  enabled: boolean;
  total: number;
  passed: number;
  failed: number;
  targets: VerifyMatrixTargetSummary[];
}

const VALID_LABEL_RE = /^[A-Za-z0-9._-]+$/;
const VALID_RUNNER_PROFILES = new Set<RunnerProfile>([
  "phase1",
  "native_android",
  "native_ios",
  "flutter_android",
]);

/** Parses `--target <label>:<platform>[:<deviceId>]`. */
export function parseInlineTargetFlag(raw: string): { target?: VerifyMatrixTargetSpec; error?: string } {
  const trimmed = raw.trim();
  const firstColon = trimmed.indexOf(":");
  if (firstColon <= 0) {
    return {
      error: `Invalid --target "${raw}". Expected "<label>:<platform>[:<deviceId>]", e.g. "ipad-mini:ios:UDID".`,
    };
  }
  const label = trimmed.slice(0, firstColon).trim();
  const rest = trimmed.slice(firstColon + 1);
  const secondColon = rest.indexOf(":");
  const platform = (secondColon >= 0 ? rest.slice(0, secondColon) : rest).trim();
  const deviceId = secondColon >= 0 ? rest.slice(secondColon + 1).trim() : undefined;

  if (!VALID_LABEL_RE.test(label)) {
    return {
      error: `Invalid target label "${label}". Expected characters [A-Za-z0-9._-].`,
    };
  }
  if (platform !== "ios" && platform !== "android") {
    return {
      error: `Invalid platform "${platform}" in --target "${raw}". Expected "ios" or "android".`,
    };
  }
  if (secondColon >= 0 && !deviceId) {
    return {
      error: `Empty deviceId in --target "${raw}". Omit trailing colon or provide a deviceId.`,
    };
  }

  return {
    target: {
      label,
      platform,
      ...(deviceId ? { deviceId } : {}),
    },
  };
}

/** Loads and validates a `--matrix-config` JSON target specification file. */
export function loadMatrixConfig(configPath: string, cwd: string): VerifyMatrixConfigFile {
  const resolved = path.resolve(cwd, configPath);
  if (!existsSync(resolved)) {
    throw new Error(`Matrix config file not found: ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf-8"));
  } catch (err) {
    throw new Error(`Invalid JSON in matrix config "${resolved}": ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Matrix config "${resolved}" must be a JSON object.`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.targets) || obj.targets.length === 0) {
    throw new Error(`Matrix config "${resolved}" must specify a non-empty "targets" array.`);
  }

  const targets: VerifyMatrixTargetSpec[] = [];
  const seenLabels = new Set<string>();
  for (let i = 0; i < obj.targets.length; i += 1) {
    const raw = obj.targets[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Matrix entry targets[${i}] in "${resolved}" must be an object.`);
    }
    const entry = raw as Record<string, unknown>;
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const platform = typeof entry.platform === "string" ? entry.platform.trim() : "";
    if (!label || !VALID_LABEL_RE.test(label)) {
      throw new Error(`Matrix entry targets[${i}] has invalid label "${label}".`);
    }
    if (seenLabels.has(label)) {
      throw new Error(`Duplicate target label "${label}" in "${resolved}".`);
    }
    seenLabels.add(label);
    if (platform !== "ios" && platform !== "android") {
      throw new Error(`Matrix target "${label}" has invalid platform "${platform}". Expected "ios" or "android".`);
    }
    if (entry.runnerProfile !== undefined && !VALID_RUNNER_PROFILES.has(entry.runnerProfile as RunnerProfile)) {
      throw new Error(`Matrix target "${label}" has invalid runnerProfile "${String(entry.runnerProfile)}".`);
    }

    targets.push({
      label,
      platform,
      ...(typeof entry.deviceId === "string" && entry.deviceId.trim().length > 0
        ? { deviceId: entry.deviceId.trim() }
        : {}),
      ...(typeof entry.appId === "string" && entry.appId.trim().length > 0
        ? { appId: entry.appId.trim() }
        : {}),
      ...(typeof entry.runnerProfile === "string"
        ? { runnerProfile: entry.runnerProfile as RunnerProfile }
        : {}),
      ...(typeof entry.baselinePath === "string" && entry.baselinePath.trim().length > 0
        ? { baselinePath: entry.baselinePath.trim() }
        : {}),
      ...(typeof entry.probeConfig === "string" && entry.probeConfig.trim().length > 0
        ? { probeConfig: entry.probeConfig.trim() }
        : {}),
    });
  }

  return { targets };
}
