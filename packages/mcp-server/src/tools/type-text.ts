import type { ToolResult, TypeTextInput } from "@mobile-e2e-mcp/contracts";
import { typeTextWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function typeText(input: TypeTextInput): Promise<ToolResult> {
  return typeTextWithMaestro(input);
}
