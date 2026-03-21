import type { TapData, TapInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { tapWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function tap(input: TapInput): Promise<ToolResult<TapData>> {
  return tapWithMaestro(input);
}
