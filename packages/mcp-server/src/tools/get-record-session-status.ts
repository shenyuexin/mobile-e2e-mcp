import { getRecordSessionStatusWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { GetRecordSessionStatusInput, RecordSessionStatusData, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function getRecordSessionStatus(input: GetRecordSessionStatusInput): Promise<ToolResult<RecordSessionStatusData>> {
  return getRecordSessionStatusWithMaestro(input);
}
