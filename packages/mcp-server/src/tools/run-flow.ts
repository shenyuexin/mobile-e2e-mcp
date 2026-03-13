import { runFlowWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";
import type { RunFlowInput, ToolResult } from "@mobile-e2e-mcp/contracts";

export async function runFlow(input: RunFlowInput): Promise<ToolResult> {
  return runFlowWithMaestro(input);
}
