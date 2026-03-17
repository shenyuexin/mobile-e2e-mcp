import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("mcp stdio entrypoint handles initialize/list/call", async () => {
  const child = spawn(process.execPath, [path.resolve(packageRoot, "bundle/bin-stdio.cjs")], {
    cwd: packageRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

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

  const send = (id: number, method: string, params: unknown): void => {
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    child.stdin.write(`${body}\n`);
  };

  const waitFor = async (id: number): Promise<any> => {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (responses.has(id)) return responses.get(id);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for MCP response id=${id}. stderr=${stderrChunks.join("")}`);
  };

  try {
    send(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });

    const initResponse = await waitFor(1);
    assert.equal(initResponse?.error, undefined);
    assert.equal(initResponse?.result?.serverInfo?.name, "mobile-e2e-mcp");

    const initializedBody = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    child.stdin.write(`${initializedBody}\n`);

    send(2, "tools/list", {});
    const listResponse = await waitFor(2);
    assert.equal(listResponse?.error, undefined);
    assert.equal(Array.isArray(listResponse?.result?.tools), true);
    assert.equal(listResponse.result.tools.some((tool: { name: string }) => tool.name === "describe_capabilities"), true);

    send(3, "tools/call", {
      name: "describe_capabilities",
      arguments: {
        sessionId: `mcp-stdio-test-${Date.now()}`,
        platform: "android",
      },
    });
    const callResponse = await waitFor(3);
    assert.equal(callResponse?.error, undefined);
    assert.equal(typeof callResponse?.result?.structuredContent?.status, "string");
  } finally {
    child.kill("SIGTERM");
  }
});
