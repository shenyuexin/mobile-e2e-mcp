import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { REASON_CODES, type ToolResult, type ToolSetName } from "@mobile-e2e-mcp/contracts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveMcpServerVersion } from "./constants/version.js";
import { createServer } from "./index.js";
import { installRuntimeSignalCleanupHandlers } from "./runtime-signal-cleanup.js";
import { buildToolList } from "./stdio-server.js";
import {
  buildToolsetDeniedResult,
  isToolEnabledInToolset,
  resolveMcpToolset,
} from "./toolsets.js";

export interface StartMcpStdioServerOptions {
  toolset?: ToolSetName;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

function buildUnknownToolResult(toolName: string, sessionId?: string): ToolResult<{ toolName: string }> {
  return {
    status: "failed",
    reasonCode: REASON_CODES.configurationError,
    sessionId: sessionId ?? "unknown-tool",
    durationMs: 0,
    attempts: 1,
    artifacts: [],
    data: { toolName },
    nextSuggestions: [`Unknown tool: "${toolName}". Call tools/list to inspect available tools.`],
  };
}

export async function startMcpStdioServer(options: StartMcpStdioServerOptions = {}): Promise<void> {
  const resolution = options.toolset
    ? { toolset: options.toolset, remainingArgs: [], source: "flag" as const, error: undefined }
    : resolveMcpToolset(options.argv ?? process.argv.slice(2), options.env ?? process.env);

  if (resolution.error) {
    process.stderr.write(`${resolution.error}\n`);
    process.exitCode = 2;
    return;
  }

  const activeToolset = resolution.toolset;
  const runtime = createServer();
  const knownTools = new Set<string>(runtime.listTools());
  const server = new Server(
    {
      name: "mobile-e2e-mcp",
      version: resolveMcpServerVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = buildToolList(activeToolset).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object",
        additionalProperties: true,
      },
    }));
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const sessionId = typeof args.sessionId === "string" ? args.sessionId : undefined;

    let result: ToolResult<unknown>;
    if (!knownTools.has(name)) {
      result = buildUnknownToolResult(name, sessionId);
    } else if (!isToolEnabledInToolset(name, activeToolset)) {
      result = buildToolsetDeniedResult(name, activeToolset, sessionId);
    } else {
      result = await runtime.invoke(name as never, args as never);
    }

    const payload = JSON.stringify(result, null, 2);
    return {
      content: [
        {
          type: "text",
          text: payload,
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  });

  installRuntimeSignalCleanupHandlers();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const currentScriptPath = process.argv[1] ?? "";
const isDirectMcpStdioScript = [
  "mcp-stdio-server.ts",
  "mcp-stdio-server.js",
  "mcp-stdio-server.cjs",
].includes(path.basename(currentScriptPath));
const isEntrypoint = currentScriptPath
  ? fileURLToPath(import.meta.url) === currentScriptPath && isDirectMcpStdioScript
  : false;

if (isEntrypoint) {
  startMcpStdioServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
