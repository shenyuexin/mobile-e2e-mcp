import type { Platform, RunnerProfile, ToolResult } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { resolveRepoPath } from "@mobile-e2e-mcp/adapter-maestro";
import { loadSessionRecord } from "@mobile-e2e-mcp/core";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { CliOptions } from "./types.js";

type ResolvedFrom = "flag" | "alias" | "preset" | "default";
export interface ResolvedContextMeta {
  sessionId: ResolvedFrom;
  platform: ResolvedFrom;
  deviceId: ResolvedFrom;
  appId: ResolvedFrom;
  runnerProfile: ResolvedFrom;
}

export interface ContextAliasResult {
  ok: boolean;
  sessionId?: string;
  resolvedContext?: ResolvedContextMeta;
  errorResult?: ToolResult<{ resolvedContext?: ResolvedContextMeta }>;
}

interface ActiveSessionCandidate {
  sessionId: string;
  platform: Platform;
  deviceId: string;
  appId: string;
  profile: RunnerProfile | null;
}

async function listActiveSessionCandidates(repoRoot: string): Promise<ActiveSessionCandidate[]> {
  const sessionsDir = path.resolve(repoRoot, "artifacts", "sessions");
  try {
    const entries = await readdir(sessionsDir, { withFileTypes: true });
    const candidates: ActiveSessionCandidate[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const sessionId = entry.name.slice(0, -".json".length);
      const record = await loadSessionRecord(repoRoot, sessionId);
      if (!record || record.closed) {
        continue;
      }
      candidates.push({
        sessionId,
        platform: record.session.platform,
        deviceId: record.session.deviceId,
        appId: record.session.appId,
        profile: record.session.profile ?? null,
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

function buildContextAliasError(sessionId: string, detail: string, nextSuggestions: string[]): ToolResult<{ resolvedContext?: ResolvedContextMeta }> {
  return {
    status: "failed",
    reasonCode: REASON_CODES.configurationError,
    sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: {},
    nextSuggestions: [detail, ...nextSuggestions],
  };
}

export async function applyContextAlias(cliOptions: CliOptions): Promise<ContextAliasResult> {
  const resolvedContext: ResolvedContextMeta = {
    sessionId: cliOptions.sessionId ? "flag" : "default",
    platform: cliOptions.platformProvided ? "flag" : "default",
    deviceId: cliOptions.deviceId ? "flag" : "default",
    appId: cliOptions.appId ? "flag" : "default",
    runnerProfile: cliOptions.runnerProfile ? "flag" : "default",
  };

  if (!cliOptions.useContextAlias) {
    return { ok: true, sessionId: cliOptions.sessionId, resolvedContext };
  }

  const repoRoot = resolveRepoPath();
  let targetSessionId = cliOptions.sessionId;

  if (!targetSessionId && cliOptions.presetName) {
    const candidates = await listActiveSessionCandidates(repoRoot);
    const platformCandidates = cliOptions.platformProvided
      ? candidates.filter((candidate) => candidate.platform === cliOptions.platform)
      : candidates;
    if (platformCandidates.length === 1) {
      targetSessionId = platformCandidates[0].sessionId;
      resolvedContext.sessionId = "alias";
    } else if (platformCandidates.length > 1) {
      return {
        ok: false,
        errorResult: buildContextAliasError(
          `context-alias-${Date.now()}`,
          "Multiple active sessions matched context alias resolution.",
          ["Pass --session-id explicitly or close extra sessions with end_session before retrying."],
        ),
      };
    }
  }

  if (!targetSessionId) {
    return { ok: true, sessionId: undefined, resolvedContext };
  }

  const sessionRecord = await loadSessionRecord(repoRoot, targetSessionId);
  if (!sessionRecord || sessionRecord.closed) {
    return { ok: true, sessionId: targetSessionId, resolvedContext };
  }

  if (!cliOptions.platformProvided) {
    cliOptions.platform = sessionRecord.session.platform;
    resolvedContext.platform = "alias";
  }
  if (!cliOptions.deviceId) {
    cliOptions.deviceId = sessionRecord.session.deviceId;
    resolvedContext.deviceId = "alias";
  }
  if (!cliOptions.appId) {
    cliOptions.appId = sessionRecord.session.appId;
    resolvedContext.appId = "alias";
  }
  if (!cliOptions.runnerProfile && sessionRecord.session.profile) {
    cliOptions.runnerProfile = sessionRecord.session.profile;
    resolvedContext.runnerProfile = "alias";
  }

  cliOptions.sessionId = targetSessionId;
  return { ok: true, sessionId: targetSessionId, resolvedContext };
}
