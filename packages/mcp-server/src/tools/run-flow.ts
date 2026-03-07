import type { RunFlowInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { runFlowWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function runFlow(input: RunFlowInput): Promise<ToolResult> {
  return runFlowWithMaestro(input);
}
