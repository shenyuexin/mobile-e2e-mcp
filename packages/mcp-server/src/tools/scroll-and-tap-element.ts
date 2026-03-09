import type { ScrollAndTapElementData, ScrollAndTapElementInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { scrollAndTapElementWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function scrollAndTapElement(input: ScrollAndTapElementInput): Promise<ToolResult<ScrollAndTapElementData>> {
  return scrollAndTapElementWithMaestro(input);
}
