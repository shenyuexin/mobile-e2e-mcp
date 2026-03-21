import { runFlowWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { RunFlowData, RunFlowInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function runFlow(input: RunFlowInput): Promise<ToolResult<RunFlowData>> {
  return runFlowWithMaestro(input);
}
