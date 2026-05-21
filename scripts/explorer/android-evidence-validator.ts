import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface AndroidExplorerEvidenceExpectations {
  appId?: string;
  platform?: string;
  mode?: string;
  minPages?: number;
  maxFailures?: number;
  minDepth?: number;
  requireEntryProbe?: boolean;
  requireAppSwitchRecovery?: boolean;
}

export interface AndroidExplorerEvidenceSummary {
  runId?: string;
  appId?: string;
  platform?: string;
  mode?: string;
  totalPages?: number;
  totalFailures?: number;
  maxDepthReached?: number;
  durationMs?: number;
  requiredFiles: string[];
  presentFiles: string[];
  evidenceSignals: {
    entryProbe: boolean;
    runnerIdentity: boolean;
    appSwitchDetected: boolean;
    appSwitchRecovered: boolean;
    reportPlatform: boolean;
    reportFailureCount: boolean;
  };
}

export interface AndroidExplorerEvidenceReport {
  schemaVersion: "android-explorer-evidence/v1";
  artifactDir: string;
  ok: boolean;
  issues: string[];
  summary: AndroidExplorerEvidenceSummary;
}

interface ExplorerSummaryJson {
  runId?: string;
  durationMs?: number;
  totalPages?: number;
  totalFailures?: number;
  maxDepthReached?: number;
}

interface ExplorerConfigJson {
  appId?: string;
  platform?: string;
  mode?: string;
}

const REQUIRED_FILES = ["config.json", "summary.json", "report.md", "tree.txt", "log.txt"] as const;

const DEFAULT_EXPECTATIONS: Required<AndroidExplorerEvidenceExpectations> = {
  appId: "com.android.settings",
  platform: "android-device",
  mode: "full",
  minPages: 1,
  maxFailures: 0,
  minDepth: 1,
  requireEntryProbe: true,
  requireAppSwitchRecovery: true,
};

function mergeExpectations(expectations: AndroidExplorerEvidenceExpectations): Required<AndroidExplorerEvidenceExpectations> {
  const merged = { ...DEFAULT_EXPECTATIONS };
  for (const [key, value] of Object.entries(expectations) as Array<[keyof AndroidExplorerEvidenceExpectations, unknown]>) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function readJson<T>(filePath: string, issues: string[]): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`${path.basename(filePath)} is not valid JSON: ${message}`);
    return undefined;
  }
}

function readText(filePath: string, issues: string[]): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`${path.basename(filePath)} is not readable: ${message}`);
    return "";
  }
}

function hasNonEmptyFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile() && statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

export function validateAndroidExplorerEvidence(
  artifactDir: string,
  expectations: AndroidExplorerEvidenceExpectations = {},
): AndroidExplorerEvidenceReport {
  const resolved = path.resolve(artifactDir);
  const expected = mergeExpectations(expectations);
  const issues: string[] = [];
  const presentFiles: string[] = [];

  if (!existsSync(resolved)) {
    issues.push(`artifact directory does not exist: ${resolved}`);
  }

  for (const filename of REQUIRED_FILES) {
    const filePath = path.join(resolved, filename);
    if (hasNonEmptyFile(filePath)) {
      presentFiles.push(filename);
    } else {
      issues.push(`${filename} is missing or empty`);
    }
  }

  const summaryJson = presentFiles.includes("summary.json")
    ? readJson<ExplorerSummaryJson>(path.join(resolved, "summary.json"), issues)
    : undefined;
  const configJson = presentFiles.includes("config.json")
    ? readJson<ExplorerConfigJson>(path.join(resolved, "config.json"), issues)
    : undefined;
  const logText = presentFiles.includes("log.txt") ? readText(path.join(resolved, "log.txt"), issues) : "";
  const reportText = presentFiles.includes("report.md") ? readText(path.join(resolved, "report.md"), issues) : "";

  const evidenceSignals = {
    entryProbe: /\[PROBE\]\s+inspect_ui status=success/.test(logText),
    runnerIdentity: new RegExp(`\\[RUNNER\\]\\s+mode=${expected.mode}, appId=${expected.appId}, platform=${expected.platform}`).test(logText),
    appSwitchDetected: /\[APP-SWITCH\]\s+Detected:/.test(logText),
    appSwitchRecovered: /\[APP-SWITCH\]\s+Returned via system back/.test(logText),
    reportPlatform: new RegExp(`\\|\\s*Platform\\s*\\|\\s*${expected.platform}\\s*\\|`).test(reportText),
    reportFailureCount: new RegExp(`\\|\\s*Failures\\s*\\|\\s*${expected.maxFailures}\\s*\\|`).test(reportText),
  };

  if (configJson?.appId !== expected.appId) {
    issues.push(`config.appId expected ${expected.appId}, got ${configJson?.appId ?? "missing"}`);
  }
  if (configJson?.platform !== expected.platform) {
    issues.push(`config.platform expected ${expected.platform}, got ${configJson?.platform ?? "missing"}`);
  }
  if (configJson?.mode !== expected.mode) {
    issues.push(`config.mode expected ${expected.mode}, got ${configJson?.mode ?? "missing"}`);
  }
  if ((summaryJson?.totalPages ?? 0) < expected.minPages) {
    issues.push(`summary.totalPages expected >= ${expected.minPages}, got ${summaryJson?.totalPages ?? "missing"}`);
  }
  if ((summaryJson?.totalFailures ?? Number.POSITIVE_INFINITY) > expected.maxFailures) {
    issues.push(`summary.totalFailures expected <= ${expected.maxFailures}, got ${summaryJson?.totalFailures ?? "missing"}`);
  }
  if ((summaryJson?.maxDepthReached ?? 0) < expected.minDepth) {
    issues.push(`summary.maxDepthReached expected >= ${expected.minDepth}, got ${summaryJson?.maxDepthReached ?? "missing"}`);
  }
  if (expected.requireEntryProbe && !evidenceSignals.entryProbe) {
    issues.push("log.txt should include successful entry inspect_ui probe evidence");
  }
  if (!evidenceSignals.runnerIdentity) {
    issues.push("log.txt should include runner identity for expected mode/app/platform");
  }
  if (expected.requireAppSwitchRecovery && !evidenceSignals.appSwitchDetected) {
    issues.push("log.txt should include app-switch boundary detection evidence");
  }
  if (expected.requireAppSwitchRecovery && !evidenceSignals.appSwitchRecovered) {
    issues.push("log.txt should include app-switch recovery evidence");
  }
  if (!evidenceSignals.reportPlatform) {
    issues.push("report.md should include expected platform");
  }
  if (!evidenceSignals.reportFailureCount) {
    issues.push("report.md should include expected failure count");
  }

  return {
    schemaVersion: "android-explorer-evidence/v1",
    artifactDir: resolved,
    ok: issues.length === 0,
    issues,
    summary: {
      runId: summaryJson?.runId,
      appId: configJson?.appId,
      platform: configJson?.platform,
      mode: configJson?.mode,
      totalPages: summaryJson?.totalPages,
      totalFailures: summaryJson?.totalFailures,
      maxDepthReached: summaryJson?.maxDepthReached,
      durationMs: summaryJson?.durationMs,
      requiredFiles: [...REQUIRED_FILES],
      presentFiles,
      evidenceSignals,
    },
  };
}
