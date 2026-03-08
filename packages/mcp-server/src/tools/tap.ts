import type { TapInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { tapWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function tap(input: TapInput): Promise<ToolResult> {
  return tapWithMaestro(input);
}
