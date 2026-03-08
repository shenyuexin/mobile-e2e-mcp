import type { TapElementData, TapElementInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { tapElementWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function tapElement(input: TapElementInput): Promise<ToolResult<TapElementData>> {
  return tapElementWithMaestro(input);
}
