import type { InspectNetworkPolicyData, InspectNetworkPolicyInput, ToolResult } from "@mobile-e2e-mcp/contracts";
import { inspectNetworkPolicyWithMaestro } from "@mobile-e2e-mcp/adapter-maestro";

export async function inspectNetworkPolicy(input: InspectNetworkPolicyInput): Promise<ToolResult<InspectNetworkPolicyData>> {
  return inspectNetworkPolicyWithMaestro(input);
}
