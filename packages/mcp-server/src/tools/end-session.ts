import { REASON_CODES, type EndSessionInput, type ToolResult } from "@mobile-e2e-mcp/contracts";

export async function endSession(input: EndSessionInput): Promise<ToolResult<{ closed: boolean; endedAt: string }>> {
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: 0,
    attempts: 1,
    artifacts: input.artifacts ?? [],
    data: {
      closed: true,
      endedAt: new Date().toISOString(),
    },
    nextSuggestions: [],
  };
}
