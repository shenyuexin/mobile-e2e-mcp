import {
  CORE_TOOL_NAMES,
  REASON_CODES,
  TOOLSET_NAMES,
  isToolSetName,
  type ToolResult,
  type ToolSetName,
} from "@mobile-e2e-mcp/contracts";

export const DEFAULT_MCP_TOOLSET: ToolSetName = TOOLSET_NAMES.core;

export const CORE_TOOL_NAME_SET = new Set<string>(CORE_TOOL_NAMES);

export interface ParsedToolsetFlagResult {
  toolset?: ToolSetName;
  remainingArgs: string[];
  error?: string;
}

export interface ResolvedMcpToolsetResult {
  toolset: ToolSetName;
  remainingArgs: string[];
  source: "flag" | "env" | "default";
  error?: string;
}

export function parseToolsetFlag(argv: string[]): ParsedToolsetFlagResult {
  const remainingArgs: string[] = [];
  let toolset: ToolSetName | undefined;
  let error: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--toolset") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        error = `Missing value for --toolset. Expected "${TOOLSET_NAMES.core}" or "${TOOLSET_NAMES.full}".`;
        continue;
      }
      index += 1;
      if (!isToolSetName(next)) {
        error = `Invalid --toolset value "${next}". Expected "${TOOLSET_NAMES.core}" or "${TOOLSET_NAMES.full}".`;
        continue;
      }
      toolset = next;
      continue;
    }

    if (arg.startsWith("--toolset=")) {
      const rawValue = arg.slice("--toolset=".length);
      if (!isToolSetName(rawValue)) {
        error = `Invalid --toolset value "${rawValue}". Expected "${TOOLSET_NAMES.core}" or "${TOOLSET_NAMES.full}".`;
        continue;
      }
      toolset = rawValue;
      continue;
    }

    remainingArgs.push(arg);
  }

  return { toolset, remainingArgs, error };
}

export function resolveMcpToolset(
  argv: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): ResolvedMcpToolsetResult {
  const flagResult = parseToolsetFlag(argv);
  if (flagResult.error) {
    return {
      toolset: DEFAULT_MCP_TOOLSET,
      remainingArgs: flagResult.remainingArgs,
      source: "flag",
      error: flagResult.error,
    };
  }

  if (flagResult.toolset) {
    return {
      toolset: flagResult.toolset,
      remainingArgs: flagResult.remainingArgs,
      source: "flag",
    };
  }

  const rawEnvToolset = env.MOBILE_E2E_TOOLSET?.trim();
  if (rawEnvToolset && rawEnvToolset.length > 0) {
    if (!isToolSetName(rawEnvToolset)) {
      return {
        toolset: DEFAULT_MCP_TOOLSET,
        remainingArgs: flagResult.remainingArgs,
        source: "env",
        error: `Invalid MOBILE_E2E_TOOLSET value "${rawEnvToolset}". Expected "${TOOLSET_NAMES.core}" or "${TOOLSET_NAMES.full}".`,
      };
    }
    return {
      toolset: rawEnvToolset,
      remainingArgs: flagResult.remainingArgs,
      source: "env",
    };
  }

  return {
    toolset: DEFAULT_MCP_TOOLSET,
    remainingArgs: flagResult.remainingArgs,
    source: "default",
  };
}

export function isToolEnabledInToolset(toolName: string, toolset: ToolSetName): boolean {
  if (toolset === TOOLSET_NAMES.full) {
    return true;
  }
  return CORE_TOOL_NAME_SET.has(toolName);
}

export function filterToolListByToolset<T extends { name: string }>(
  tools: readonly T[],
  toolset: ToolSetName,
): T[] {
  if (toolset === TOOLSET_NAMES.full) {
    return [...tools];
  }
  return tools.filter((tool) => CORE_TOOL_NAME_SET.has(tool.name));
}

export function buildToolsetDeniedResult(
  toolName: string,
  toolset: ToolSetName,
  sessionId?: string,
): ToolResult<{ toolName: string; activeToolset: ToolSetName; requiredToolset: ToolSetName }> {
  return {
    status: "failed",
    reasonCode: REASON_CODES.unsupportedOperation,
    sessionId: sessionId ?? "toolset-guard",
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: {
      toolName,
      activeToolset: toolset,
      requiredToolset: TOOLSET_NAMES.full,
    },
    nextSuggestions: [
      `Tool "${toolName}" is not enabled in toolset "${toolset}". Restart the MCP server with "--toolset ${TOOLSET_NAMES.full}" (or set MOBILE_E2E_TOOLSET=${TOOLSET_NAMES.full}) to enable all tools.`,
    ],
  };
}
