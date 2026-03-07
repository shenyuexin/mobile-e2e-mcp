import path from "node:path";
import { REASON_CODES, type Session, type StartSessionInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

function buildDefaultDeviceId(platform: StartSessionInput["platform"]): string {
  return platform === "android" ? "emulator-5554" : "ADA078B9-3C6B-4875-8B85-A7789F368816";
}

function buildDefaultAppId(platform: StartSessionInput["platform"]): string {
  return platform === "android" ? "host.exp.exponent" : "host.exp.Exponent";
}

function buildDefaultArtifactsRoot(sessionId: string, platform: StartSessionInput["platform"], profile?: string | null): string {
  return profile
    ? path.posix.join("artifacts", "mcp-server", sessionId, platform, profile)
    : path.posix.join("artifacts", "mcp-server", sessionId, platform);
}

function buildDefaultSampleName(profile?: string | null): string {
  if (profile === "native_android" || profile === "native_ios") {
    return "mobitru-native";
  }

  if (profile === "flutter_android") {
    return "mobitru-flutter";
  }

  return "rn-login-demo";
}

export async function startSession(input: StartSessionInput): Promise<ToolResult<Session>> {
  const sessionId = input.sessionId ?? `session-${Date.now()}`;
  const profile = input.profile ?? null;
  const artifactsRoot = input.artifactsRoot ?? buildDefaultArtifactsRoot(sessionId, input.platform, profile);

  const session: Session = {
    sessionId,
    platform: input.platform,
    deviceId: input.deviceId ?? buildDefaultDeviceId(input.platform),
    appId: input.appId ?? buildDefaultAppId(input.platform),
    policyProfile: input.policyProfile ?? "sample-harness-default",
    startedAt: new Date().toISOString(),
    artifactsRoot,
    profile,
    phase: input.phase ?? "phase2",
    sampleName: input.sampleName ?? buildDefaultSampleName(profile),
    timeline: [
      {
        timestamp: new Date().toISOString(),
        type: "session_started",
        detail: `Initialized ${input.platform} sample session`,
      },
    ],
  };

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: session,
    nextSuggestions: ["Invoke run_flow with the returned sessionId to execute the sample harness."],
  };
}
