import type { QueryUiData, QueryUiInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { queryUiWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function queryUi(input: QueryUiInput): Promise<ToolResult<QueryUiData>> {
  return queryUiWithMaestro(input);
}
