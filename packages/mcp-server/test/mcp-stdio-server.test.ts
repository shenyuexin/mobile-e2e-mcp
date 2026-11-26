import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installRuntimeSignalCleanupHandlers } from "../src/runtime-signal-cleanup.js";

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

test("mcp stdio entrypoint defaults to core toolset (20 tools), blocks hidden tools, and invokes core tools", async () => {
  await withMcpStdioClient({}, async ({ send }) => {
    const listResponse = await send(2, "tools/list", {});
    assert.equal(listResponse?.error, undefined);
    const tools = listResponse?.result?.tools as Array<{ name: string }>;
    assert.equal(Array.isArray(tools), true);
    assert.equal(tools.length, 20);
    assert.equal(tools.some((tool) => tool.name === "describe_capabilities"), true);
    assert.equal(tools.some((tool) => tool.name === "audit_ui_surface"), true);
    assert.equal(tools.some((tool) => tool.name === "perform_gesture"), true);
    assert.equal(tools.some((tool) => tool.name === "record_screen"), true);
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

test("mcp stdio entrypoint exposes all 68 tools with --toolset full", async () => {
  await withMcpStdioClient({ args: ["--toolset", "full"] }, async ({ send }) => {
    const listResponse = await send(2, "tools/list", {});
    const tools = listResponse?.result?.tools as Array<{ name: string }>;
    assert.equal(tools.length, 68);
    assert.equal(tools.some((tool) => tool.name === "collect_diagnostics"), true);
    assert.equal(tools.some((tool) => tool.name === "run_flow"), true);
  });
});

test("mcp stdio entrypoint exposes all 68 tools with MOBILE_E2E_TOOLSET=full", async () => {
  await withMcpStdioClient({ env: { MOBILE_E2E_TOOLSET: "full" } }, async ({ send }) => {
    const listResponse = await send(2, "tools/list", {});
    const tools = listResponse?.result?.tools as Array<{ name: string }>;
    assert.equal(tools.length, 68);
  });
});

test("installRuntimeSignalCleanupHandlers cleans up once and exits with 130/143", () => {
  for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    const targetProcess = new EventEmitter();
    let cleanupCalls = 0;
    const exitCodes: number[] = [];
    const uninstall = installRuntimeSignalCleanupHandlers({
      targetProcess,
      cleanup: () => {
        cleanupCalls += 1;
      },
      exit: (code) => {
        exitCodes.push(code);
      },
    });
    targetProcess.emit(signal);
    targetProcess.emit(signal);
    assert.equal(cleanupCalls, 1);
    assert.deepEqual(exitCodes, [expectedCode]);
    uninstall();
  }
});

async function assertDirectEntrypointSignalExit(
  entrypointRelPath: string,
  signal: "SIGINT" | "SIGTERM",
  expectedCode: number,
): Promise<void> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", entrypointRelPath, "--toolset", "core"],
    {
      cwd: packageRoot,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdoutBuffer = "";
  let initResolved = false;
  const stderrChunks: string[] = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => stderrChunks.push(chunk));

  const waitInit = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for initialize from ${entrypointRelPath}. stderr=${stderrChunks.join("")}`));
    }, 15_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      while (true) {
        const idx = stdoutBuffer.indexOf("\n");
        if (idx === -1) break;
        const line = stdoutBuffer.slice(0, idx).trim();
        stdoutBuffer = stdoutBuffer.slice(idx + 1);
        if (!line) continue;
        const parsed = JSON.parse(line) as { id?: number; error?: unknown };
        if (parsed.id === 1) {
          clearTimeout(timer);
          initResolved = true;
          resolve();
          return;
        }
      }
    });
    child.once("exit", (code, sig) => {
      if (!initResolved) {
        clearTimeout(timer);
        reject(new Error(`${entrypointRelPath} exited early (code=${String(code)}, signal=${String(sig)}). stderr=${stderrChunks.join("")}`));
      }
    });
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "signal-test-client", version: "1.0.0" },
      },
    })}\n`,
  );
  await waitInit;

  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out waiting for ${entrypointRelPath} exit after ${signal}`));
    }, 5_000);
    child.once("exit", (code, sig) => {
      clearTimeout(timer);
      resolve({ code, signal: sig });
    });
  });

  child.kill(signal);
  const exitResult = await exitPromise;
  assert.equal(exitResult.code, expectedCode, `Expected ${entrypointRelPath} to exit with ${expectedCode} on ${signal}, got code=${String(exitResult.code)}, signal=${String(exitResult.signal)}`);
  assert.equal(exitResult.signal, null);
}

test("mcp stdio entrypoints handle SIGTERM (143) and SIGINT (130) cleanly", async () => {
  await assertDirectEntrypointSignalExit("src/mcp-stdio-server.ts", "SIGTERM", 143);
  await assertDirectEntrypointSignalExit("src/bin-stdio.ts", "SIGINT", 130);
});
