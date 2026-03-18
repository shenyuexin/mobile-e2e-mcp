import { endRecordSessionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { EndRecordSessionData, EndRecordSessionInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function endRecordSession(input: EndRecordSessionInput): Promise<ToolResult<EndRecordSessionData>> {
  return endRecordSessionWithMaestro(input);
}
