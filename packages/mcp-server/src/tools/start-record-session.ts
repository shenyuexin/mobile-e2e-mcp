import { startRecordSessionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { StartRecordSessionData, StartRecordSessionInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function startRecordSession(input: StartRecordSessionInput): Promise<ToolResult<StartRecordSessionData>> {
  return startRecordSessionWithMaestro(input);
}
