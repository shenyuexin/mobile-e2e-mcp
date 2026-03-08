import type { LaunchAppInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { launchAppWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function launchApp(input: LaunchAppInput): Promise<ToolResult> {
  return launchAppWithMaestro(input);
}
