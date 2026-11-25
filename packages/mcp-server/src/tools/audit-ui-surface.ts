import type { AuditUiSurfaceData, AuditUiSurfaceInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { auditUiSurfaceWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function auditUiSurface(input: AuditUiSurfaceInput): Promise<ToolResult<AuditUiSurfaceData>> {
  return auditUiSurfaceWithMaestro(input);
}
