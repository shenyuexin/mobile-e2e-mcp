import type { TerminateAppInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { terminateAppWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function terminateApp(input: TerminateAppInput): Promise<ToolResult> {
  return terminateAppWithMaestro(input);
}
