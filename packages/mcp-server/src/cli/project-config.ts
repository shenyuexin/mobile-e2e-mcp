import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isToolSetName,
  type Platform,
  type RunnerProfile,
  type ToolSetName,
} from "@mobile-e2e-mcp/contracts";

export const DEFAULT_PROJECT_CONFIG_PATH = ".e2e/config.yaml";

export interface ProjectE2EHooksConfig {
  healthUrl?: string;
  logsUrl?: string;
  cleanupUrl?: string;
}

export interface ProjectE2EExplorerConfig {
  mode?: "smoke" | "scoped" | "full";
  maxDepth?: number;
  output?: string;
}

export interface ProjectE2EAuditConfig {
  baselinePath?: string;
  baselineMode?: "compare" | "update";
  output?: string;
  failOnRegression?: boolean;
}

export interface ProjectE2EConfig {
  version: 1;
  appId?: string;
  platform?: Platform;
  deviceId?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  harnessConfigPath?: string;
  flowPath?: string;
  toolset?: ToolSetName;
  launchEnv?: Record<string, string>;
  hooks?: ProjectE2EHooksConfig;
  explorer?: ProjectE2EExplorerConfig;
  audit?: ProjectE2EAuditConfig;
}

const VALID_RUNNER_PROFILES = new Set<RunnerProfile>([
  "phase1",
  "native_android",
  "native_ios",
  "flutter_android",
]);

const VALID_EXPLORER_MODES = new Set(["smoke", "scoped", "full"]);

function formatYamlScalar(value: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed) as string;
      } catch {
        return trimmed.slice(1, -1);
      }
    }
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inDouble) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1] ?? "")) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function parseKeyValueLine(raw: string): { key: string; value: string } | undefined {
  const colonIdx = raw.indexOf(":");
  if (colonIdx <= 0) {
    return undefined;
  }
  const key = unquoteYamlScalar(raw.slice(0, colonIdx).trim());
  const value = raw.slice(colonIdx + 1).trim();
  return { key, value };
}

function coerceParsedRecord(rawObj: Record<string, unknown>): ProjectE2EConfig {
  const config: ProjectE2EConfig = { version: 1 };
  if (typeof rawObj.appId === "string" && rawObj.appId.length > 0) config.appId = rawObj.appId;
  if (rawObj.platform === "ios" || rawObj.platform === "android") config.platform = rawObj.platform;
  if (typeof rawObj.deviceId === "string" && rawObj.deviceId.length > 0) config.deviceId = rawObj.deviceId;
  if (typeof rawObj.runnerProfile === "string" && VALID_RUNNER_PROFILES.has(rawObj.runnerProfile as RunnerProfile)) {
    config.runnerProfile = rawObj.runnerProfile as RunnerProfile;
  }
  if (typeof rawObj.policyProfile === "string" && rawObj.policyProfile.length > 0) config.policyProfile = rawObj.policyProfile;
  if (typeof rawObj.harnessConfigPath === "string" && rawObj.harnessConfigPath.length > 0) {
    config.harnessConfigPath = rawObj.harnessConfigPath;
  }
  if (typeof rawObj.flowPath === "string" && rawObj.flowPath.length > 0) config.flowPath = rawObj.flowPath;
  if (isToolSetName(rawObj.toolset)) config.toolset = rawObj.toolset;

  if (rawObj.launchEnv && typeof rawObj.launchEnv === "object" && !Array.isArray(rawObj.launchEnv)) {
    const entries = Object.entries(rawObj.launchEnv as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean")
      .map(([k, v]) => [k, String(v)] as const);
    if (entries.length > 0) {
      config.launchEnv = Object.fromEntries(entries);
    }
  }

  if (rawObj.hooks && typeof rawObj.hooks === "object" && !Array.isArray(rawObj.hooks)) {
    const hooksObj = rawObj.hooks as Record<string, unknown>;
    const hooks: ProjectE2EHooksConfig = {};
    if (typeof hooksObj.healthUrl === "string" && hooksObj.healthUrl.length > 0) hooks.healthUrl = hooksObj.healthUrl;
    if (typeof hooksObj.logsUrl === "string" && hooksObj.logsUrl.length > 0) hooks.logsUrl = hooksObj.logsUrl;
    if (typeof hooksObj.cleanupUrl === "string" && hooksObj.cleanupUrl.length > 0) hooks.cleanupUrl = hooksObj.cleanupUrl;
    if (Object.keys(hooks).length > 0) config.hooks = hooks;
  }

  if (rawObj.explorer && typeof rawObj.explorer === "object" && !Array.isArray(rawObj.explorer)) {
    const expObj = rawObj.explorer as Record<string, unknown>;
    const explorer: ProjectE2EExplorerConfig = {};
    if (typeof expObj.mode === "string" && VALID_EXPLORER_MODES.has(expObj.mode)) {
      explorer.mode = expObj.mode as "smoke" | "scoped" | "full";
    }
    if (typeof expObj.maxDepth === "number" && Number.isFinite(expObj.maxDepth) && expObj.maxDepth > 0) {
      explorer.maxDepth = Math.floor(expObj.maxDepth);
    }
    if (typeof expObj.output === "string" && expObj.output.length > 0) explorer.output = expObj.output;
    if (Object.keys(explorer).length > 0) config.explorer = explorer;
  }

  if (rawObj.audit && typeof rawObj.audit === "object" && !Array.isArray(rawObj.audit)) {
    const auditObj = rawObj.audit as Record<string, unknown>;
    const audit: ProjectE2EAuditConfig = {};
    if (typeof auditObj.baselinePath === "string" && auditObj.baselinePath.length > 0) {
      audit.baselinePath = auditObj.baselinePath;
    }
    if (auditObj.baselineMode === "compare" || auditObj.baselineMode === "update") {
      audit.baselineMode = auditObj.baselineMode;
    }
    if (typeof auditObj.output === "string" && auditObj.output.length > 0) {
      audit.output = auditObj.output;
    }
    if (typeof auditObj.failOnRegression === "boolean") {
      audit.failOnRegression = auditObj.failOnRegression;
    } else if (auditObj.failOnRegression === "true" || auditObj.failOnRegression === "false") {
      audit.failOnRegression = auditObj.failOnRegression === "true";
    }
    if (Object.keys(audit).length > 0) config.audit = audit;
  }

  return config;
}

export function serializeProjectConfigYaml(config: ProjectE2EConfig): string {
  const lines: string[] = [
    "# mobile-e2e-mcp project configuration",
    "# Generated by `mobile-e2e-mcp init`",
    `version: ${config.version ?? 1}`,
  ];

  if (config.platform) lines.push(`platform: ${config.platform}`);
  if (config.appId) lines.push(`appId: ${formatYamlScalar(config.appId)}`);
  if (config.deviceId) lines.push(`deviceId: ${formatYamlScalar(config.deviceId)}`);
  if (config.runnerProfile) lines.push(`runnerProfile: ${config.runnerProfile}`);
  if (config.policyProfile) lines.push(`policyProfile: ${formatYamlScalar(config.policyProfile)}`);
  if (config.harnessConfigPath) lines.push(`harnessConfigPath: ${formatYamlScalar(config.harnessConfigPath)}`);
  if (config.flowPath) lines.push(`flowPath: ${formatYamlScalar(config.flowPath)}`);
  if (config.toolset) lines.push(`toolset: ${config.toolset}`);

  const launchEnvEntries = Object.entries(config.launchEnv ?? {});
  if (launchEnvEntries.length > 0) {
    lines.push("launchEnv:");
    for (const [key, value] of launchEnvEntries) {
      lines.push(`  ${key}: ${formatYamlScalar(value)}`);
    }
  } else {
    lines.push("# launchEnv:");
    lines.push("#   UITEST_MODE: \"1\"");
  }

  if (config.hooks && Object.keys(config.hooks).length > 0) {
    lines.push("hooks:");
    if (config.hooks.healthUrl) lines.push(`  healthUrl: ${formatYamlScalar(config.hooks.healthUrl)}`);
    if (config.hooks.logsUrl) lines.push(`  logsUrl: ${formatYamlScalar(config.hooks.logsUrl)}`);
    if (config.hooks.cleanupUrl) lines.push(`  cleanupUrl: ${formatYamlScalar(config.hooks.cleanupUrl)}`);
  } else {
    lines.push("# hooks:");
    lines.push("#   healthUrl: http://127.0.0.1:8080/health");
  }

  if (config.explorer && Object.keys(config.explorer).length > 0) {
    lines.push("explorer:");
    if (config.explorer.mode) lines.push(`  mode: ${config.explorer.mode}`);
    if (config.explorer.maxDepth !== undefined) lines.push(`  maxDepth: ${config.explorer.maxDepth}`);
    if (config.explorer.output) lines.push(`  output: ${formatYamlScalar(config.explorer.output)}`);
  } else {
    lines.push("explorer:");
    lines.push("  mode: scoped");
    lines.push("  output: ./explorer-reports");
  }

  if (config.audit && Object.keys(config.audit).length > 0) {
    lines.push("audit:");
    if (config.audit.baselinePath) lines.push(`  baselinePath: ${formatYamlScalar(config.audit.baselinePath)}`);
    if (config.audit.baselineMode) lines.push(`  baselineMode: ${config.audit.baselineMode}`);
    if (config.audit.output) lines.push(`  output: ${formatYamlScalar(config.audit.output)}`);
    if (config.audit.failOnRegression !== undefined) {
      lines.push(`  failOnRegression: ${config.audit.failOnRegression}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

export function parseProjectConfigYaml(raw: string): ProjectE2EConfig {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { version: 1 };
  }
  if (trimmed.startsWith("{")) {
    const parsedJson = JSON.parse(trimmed) as Record<string, unknown>;
    return coerceParsedRecord(parsedJson);
  }

  const root: Record<string, unknown> = { version: 1 };
  let activeSection: "launchEnv" | "hooks" | "explorer" | "audit" | undefined;

  for (const rawLine of raw.split(/\r?\n/)) {
    const withoutComment = stripInlineComment(rawLine);
    if (!withoutComment.trim()) {
      continue;
    }

    const indent = withoutComment.length - withoutComment.trimStart().length;
    const content = withoutComment.trim();
    const kv = parseKeyValueLine(content);
    if (!kv) {
      continue;
    }

    if (indent === 0) {
      activeSection = undefined;
      if (kv.value.length === 0) {
        if (kv.key === "launchEnv" || kv.key === "hooks" || kv.key === "explorer" || kv.key === "audit") {
          activeSection = kv.key;
          if (!root[kv.key]) {
            root[kv.key] = {};
          }
        }
        continue;
      }
      const unquoted = unquoteYamlScalar(kv.value);
      if (kv.key === "version") {
        const num = Number(unquoted);
        root.version = Number.isFinite(num) ? num : 1;
      } else {
        root[kv.key] = unquoted;
      }
      continue;
    }

    if (indent > 0 && activeSection && kv.value.length > 0) {
      const sectionObj = (root[activeSection] as Record<string, unknown>) ?? {};
      const unquoted = unquoteYamlScalar(kv.value);
      if (activeSection === "explorer" && kv.key === "maxDepth") {
        const parsedDepth = Number(unquoted);
        if (Number.isFinite(parsedDepth) && parsedDepth > 0) {
          sectionObj.maxDepth = Math.floor(parsedDepth);
        }
      } else if (activeSection === "audit" && kv.key === "failOnRegression") {
        sectionObj.failOnRegression = unquoted === "true";
      } else {
        sectionObj[kv.key] = unquoted;
      }
      root[activeSection] = sectionObj;
    }
  }

  return coerceParsedRecord(root);
}

export async function loadProjectConfig(
  cwd: string = process.cwd(),
  explicitPath?: string,
): Promise<{ path: string; config: ProjectE2EConfig } | undefined> {
  const targetPath = path.resolve(cwd, explicitPath ?? DEFAULT_PROJECT_CONFIG_PATH);
  if (!existsSync(targetPath)) {
    if (explicitPath) {
      throw new Error(`Project E2E config not found: ${targetPath}`);
    }
    return undefined;
  }

  const content = await readFile(targetPath, "utf8");
  return {
    path: targetPath,
    config: parseProjectConfigYaml(content),
  };
}
