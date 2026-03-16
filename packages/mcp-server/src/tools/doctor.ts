import type { DoctorData, DoctorInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { runDoctor } from "@mobile-e2e-mcp/adapter-maestro";

export async function doctor(input: DoctorInput): Promise<ToolResult<DoctorData>> {
  return runDoctor(input);
}
