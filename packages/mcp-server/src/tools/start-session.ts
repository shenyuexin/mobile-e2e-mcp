import { buildCapabilityProfile, resolveRepoPath, resolveSessionDefaults } from "@mobile-e2e-mcp/adapter-maestro";
import { loadAccessProfile, persistStartedSession } from "@mobile-e2e-mcp/core";
import { REASON_CODES, type Session, type StartSessionInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

function buildDefaultDeviceId(platform: StartSessionInput["platform"]): string {
  return platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816";
}

function buildDefaultAppId(platform: StartSessionInput["platform"]): string {
  return platform === "android" ? "host.exp.exponent" : "host.exp.Exponent";
}

export async function startSession(input: StartSessionInput): Promise<ToolResult<Session>> {
  const repoRoot = resolveRepoPath();
  const sessionId = input.sessionId ?? `session-${Date.now()}`;
  const profile = input.profile ?? null;
  const policyProfile = input.policyProfile ?? "sample-harness-default";
  const accessProfile = await loadAccessProfile(repoRoot, policyProfile);
  if (!accessProfile) {
    const startedAt = new Date().toISOString();
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId,
      durationMs: 0,
      attempts: 1,
      artifacts: [],
      data: {
        sessionId,
        platform: input.platform,
        deviceId: input.deviceId ?? buildDefaultDeviceId(input.platform),
        appId: input.appId ?? buildDefaultAppId(input.platform),
        policyProfile,
        startedAt,
        artifactsRoot: input.artifactsRoot ?? "artifacts/mcp-server/invalid-session",
        profile,
        phase: input.phase ?? "phase2",
        sampleName: input.sampleName ?? "unknown",
        capabilities: buildCapabilityProfile(input.platform, profile),
        timeline: [
          {
            timestamp: startedAt,
            type: "session_start_rejected",
            detail: `Rejected unknown policy profile ${policyProfile}`,
          },
        ],
      },
      nextSuggestions: [`Unknown policy profile '${policyProfile}'. Use one of the configured access profiles before retrying start_session.`],
    };
  }
  const sessionDefaults = await resolveSessionDefaults({
    sessionId,
    platform: input.platform,
    runnerProfile: profile,
    harnessConfigPath: input.harnessConfigPath,
    artifactRoot: input.artifactsRoot,
  });

  const session: Session = {
    sessionId,
    platform: input.platform,
    deviceId: input.deviceId ?? sessionDefaults.deviceId ?? buildDefaultDeviceId(input.platform),
    appId: input.appId ?? sessionDefaults.appId ?? buildDefaultAppId(input.platform),
    policyProfile,
    startedAt: new Date().toISOString(),
    artifactsRoot: sessionDefaults.artifactsRoot,
    profile,
    phase: input.phase ?? "phase2",
    sampleName: input.sampleName ?? sessionDefaults.sampleName,
    capabilities: buildCapabilityProfile(input.platform, profile),
    timeline: [
      {
        timestamp: new Date().toISOString(),
        type: "session_started",
        detail: `Initialized ${input.platform} sample session`,
      },
    ],
  };
  const sessionArtifactPath = await persistStartedSession(repoRoot, session);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [sessionArtifactPath],
    data: session,
    nextSuggestions: ["Invoke run_flow with the returned sessionId to execute the sample harness.", "Use the persisted session artifact to restore context across agent/tool restarts."],
  };
}
