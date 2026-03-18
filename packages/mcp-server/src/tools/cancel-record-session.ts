import { cancelRecordSessionWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { CancelRecordSessionData, CancelRecordSessionInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function cancelRecordSession(input: CancelRecordSessionInput): Promise<ToolResult<CancelRecordSessionData>> {
  return cancelRecordSessionWithMaestro(input);
}
