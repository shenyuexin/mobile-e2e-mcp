import type { ToolResult, TypeTextData, TypeTextInput } from "@mobile-e2e-mcp/contracts";
import { typeTextWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function typeText(input: TypeTextInput): Promise<ToolResult<TypeTextData>> {
  return typeTextWithMaestro(input);
}
