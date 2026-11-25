import { TOOL_NAMES } from "./tool-names.js";

/**
 * Named MCP toolset presets controlling which tools are exposed over MCP stdio.
 * - "core": 18 high-frequency tools for daily automation (~73% less schema context).
 * - "full": all registered MCP tools (67 tools).
 */
export const TOOLSET_NAMES = {
  core: "core",
  full: "full",
} as const;

export type ToolSetName = (typeof TOOLSET_NAMES)[keyof typeof TOOLSET_NAMES];

export const CORE_TOOL_NAMES = [
  TOOL_NAMES.doctor,
  TOOL_NAMES.listDevices,
  TOOL_NAMES.describeCapabilities,
  TOOL_NAMES.startSession,
  TOOL_NAMES.endSession,
  TOOL_NAMES.launchApp,
  TOOL_NAMES.terminateApp,
  TOOL_NAMES.inspectUi,
  TOOL_NAMES.queryUi,
  TOOL_NAMES.waitForUi,
  TOOL_NAMES.auditUiSurface,
  TOOL_NAMES.tapElement,
  TOOL_NAMES.tap,
  TOOL_NAMES.typeIntoElement,
  TOOL_NAMES.scrollOnly,
  TOOL_NAMES.navigateBack,
  TOOL_NAMES.takeScreenshot,
  TOOL_NAMES.getLogs,
] as const;

export function isToolSetName(value: unknown): value is ToolSetName {
  return value === TOOLSET_NAMES.core || value === TOOLSET_NAMES.full;
}
