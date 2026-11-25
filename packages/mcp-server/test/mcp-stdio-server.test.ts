import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withMcpStdioClient<T>(
  options: { args?: string[]; env?: Record<string, string | undefined> },
  fn: (rpc: {
    send: (id: number, method: string, params: unknown) => Promise<any>;
  }) => Promise<T>,
): Promise<T> {
  const child = spawn(
    "pnpm",
    ["exec", "tsx", "src/mcp-stdio-server.ts", ...(options.args ?? [])],
    {
      cwd: packageRoot,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdoutBuffer = "";
  const responses = new Map<number, unknown>();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    while (true) {
      const lineEnd = stdoutBuffer.indexOf("\n");
      if (lineEnd === -1) break;
      const line = stdoutBuffer.slice(0, lineEnd).trim();
      stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
      if (!line) continue;
      const parsed = JSON.parse(line) as { id?: number };
      if (typeof parsed.id === "number") responses.set(parsed.id, parsed);
    }
  });

  const stderrChunks: string[] = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => stderrChunks.push(chunk));

  const waitFor = async (id: number): Promise<any> => {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (responses.has(id)) return responses.get(id);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for MCP response id=${id}. stderr=${stderrChunks.join("")}`);
  };

  const send = async (id: number, method: string, params: unknown): Promise<any> => {
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    child.stdin.write(`${body}\n`);
    return waitFor(id);
  };

  try {
    const initResponse = await send(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    assert.equal(initResponse?.error, undefined);
    assert.equal(initResponse?.result?.serverInfo?.name, "mobile-e2e-mcp");

    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
    return await fn({ send });
  } finally {
    child.kill("SIGTERM");
  }
}

test("mcp stdio entrypoint defaults to core toolset (18 tools), blocks hidden tools, and invokes core tools", async () => {
  await withMcpStdioClient({}, async ({ send }) => {
    const listResponse = await send(2, "tools/list", {});
    assert.equal(listResponse?.error, undefined);
    const tools = listResponse?.result?.tools as Array<{ name: string }>;
    assert.equal(Array.isArray(tools), true);
    assert.equal(tools.length, 18);
    assert.equal(tools.some((tool) => tool.name === "describe_capabilities"), true);
    assert.equal(tools.some((tool) => tool.name === "audit_ui_surface"), true);
    assert.equal(tools.some((tool) => tool.name === "collect_diagnostics"), false);

    const callResponse = await send(3, "tools/call", {
      name: "describe_capabilities",
      arguments: {
        sessionId: `mcp-stdio-test-${Date.now()}`,
        platform: "android",
      },
    });
    assert.equal(callResponse?.error, undefined);
    assert.equal(typeof callResponse?.result?.structuredContent?.status, "string");

    const blockedResponse = await send(4, "tools/call", {
      name: "collect_diagnostics",
      arguments: {
        sessionId: `mcp-stdio-blocked-${Date.now()}`,
        platform: "android",
      },
    });
    assert.equal(blockedResponse?.error, undefined);
    assert.equal(blockedResponse?.result?.structuredContent?.status, "failed");
    assert.equal(blockedResponse?.result?.structuredContent?.reasonCode, "UNSUPPORTED_OPERATION");
    assert.match(
      String(blockedResponse?.result?.structuredContent?.nextSuggestions?.[0] ?? ""),
      /--toolset full/,
    );
  });
});

test("mcp stdio entrypoint exposes all 67 tools with --toolset full", async () => {
  await withMcpStdioClient({ args: ["--toolset", "full"] }, async ({ send }) => {
    const listResponse = await send(2, "tools/list", {});
    const tools = listResponse?.result?.tools as Array<{ name: string }>;
    assert.equal(tools.length, 67);
    assert.equal(tools.some((tool) => tool.name === "collect_diagnostics"), true);
    assert.equal(tools.some((tool) => tool.name === "run_flow"), true);
  });
});

test("mcp stdio entrypoint exposes all 67 tools with MOBILE_E2E_TOOLSET=full", async () => {
  await withMcpStdioClient({ env: { MOBILE_E2E_TOOLSET: "full" } }, async ({ send }) => {
    const listResponse = await send(2, "tools/list", {});
    const tools = listResponse?.result?.tools as Array<{ name: string }>;
    assert.equal(tools.length, 67);
  });
});
