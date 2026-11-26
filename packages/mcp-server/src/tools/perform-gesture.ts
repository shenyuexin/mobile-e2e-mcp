import type { PerformGestureData, PerformGestureInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { performGestureWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function performGesture(input: PerformGestureInput): Promise<ToolResult<PerformGestureData>> {
  return performGestureWithMaestro(input);
}
