import type { ScreenshotData, ScreenshotInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { takeScreenshotWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function takeScreenshot(input: ScreenshotInput): Promise<ToolResult<ScreenshotData>> {
  return takeScreenshotWithMaestro(input);
}
