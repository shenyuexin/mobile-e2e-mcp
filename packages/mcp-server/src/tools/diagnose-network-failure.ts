import type { DiagnoseNetworkFailureData, DiagnoseNetworkFailureInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { diagnoseNetworkFailureWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function diagnoseNetworkFailure(input: DiagnoseNetworkFailureInput): Promise<ToolResult<DiagnoseNetworkFailureData>> {
  return diagnoseNetworkFailureWithMaestro(input);
}
