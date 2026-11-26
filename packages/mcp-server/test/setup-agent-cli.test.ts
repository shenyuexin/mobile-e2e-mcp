import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  executeSetupAgent,
  mergeJsonMcpConfig,
  mergeTomlMcpConfig,
  parseSetupAgentArgs,
} from "../src/cli/setup-agent-command.ts";
import { runUnifiedCli } from "../src/cli/unified-cli.ts";

async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> {
  const originalLog = console.log;
  const originalError = console.error;
  const out: string[] = [];
  const err: string[] = [];
  console.log = (...args: unknown[]) => out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(" "));
  try {
    return { result: await fn(), stdout: out.join("\n"), stderr: err.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("parseSetupAgentArgs parses and validates all flags", () => {
  const options = parseSetupAgentArgs([
    "--target", "cursor", "--toolset", "full", "--cwd", "/tmp/work", "--dry-run", "--force", "--json",
  ]);
  assert.equal(options.target, "cursor");
  assert.equal(options.toolset, "full");
  assert.equal(options.cwd, "/tmp/work");
  assert.equal(options.dryRun, true);
  assert.equal(options.force, true);
  assert.equal(options.json, true);
  assert.match(parseSetupAgentArgs(["--target", "nope"]).error ?? "", /Invalid --target/);
  assert.match(parseSetupAgentArgs(["--toolset", "nope"]).error ?? "", /Invalid --toolset/);
});

test("setup-agent --dry-run previews all targets without writing files", async () => {
  for (const target of ["claude", "cursor", "opencode", "codex"] as const) {
    const dir = await mkdtemp(path.join(os.tmpdir(), `m2e-setup-dry-${target}-`));
    try {
      const captured = await captureConsole(() =>
        executeSetupAgent(["--target", target, "--dry-run", "--json"], dir),
      );
      assert.equal(captured.result, 0);
      const payload = JSON.parse(captured.stdout) as {
        target: string;
        dryRun: boolean;
        files: Array<{ action: string; kind: string }>;
      };
      assert.equal(payload.target, target);
      assert.equal(payload.dryRun, true);
      assert.equal(payload.files.length, 2);
      assert.ok(payload.files.every((file) => file.action.startsWith("would-")));
      const entries = ["mcp.json", "opencode.json", "config.toml", "CLAUDE.md", "AGENTS.md", "mobile-e2e.mdc"];
      assert.equal(
        entries.some((name) => {
          const candidates = [path.join(dir, name), path.join(dir, ".cursor", name), path.join(dir, ".codex", name), path.join(dir, ".cursor", "rules", name)];
          return candidates.some((candidate) => existsSync(candidate));
        }),
        false,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("setup-agent writes MCP config and guidance idempotently, preserving unrelated servers", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-setup-claude-"));
  try {
    await captureConsole(() => executeSetupAgent(["--target", "claude"], dir));
    const configPath = path.join(dir, ".mcp.json");
    const first = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    assert.deepEqual(first.mcpServers["mobile-e2e-mcp"]?.args, [
      "-y", "@shenyuexin/mobile-e2e-mcp@latest",
    ]);
    const guidance = readFileSync(path.join(dir, "CLAUDE.md"), "utf-8");
    assert.match(guidance, /mobile-e2e-mcp:begin/);
    assert.match(guidance, /explore --no-prompt --export-flows/);
    assert.doesNotMatch(guidance, /node_modules|scripts\/|pnpm /);

    // Add an unrelated server, then re-run: it must survive.
    first.mcpServers["unrelated-tool"] = { command: "node", args: ["server.js"] };
    writeFileSync(configPath, JSON.stringify(first, null, 2), "utf-8");

    const second = await captureConsole(() => executeSetupAgent(["--target", "claude", "--json"], dir));
    const payload = JSON.parse(second.stdout) as { files: Array<{ path: string; action: string }> };
    assert.ok(payload.files.every((file) => file.action === "unchanged"));
    const merged = JSON.parse(readFileSync(configPath, "utf-8")) as {
      mcpServers: Record<string, unknown>;
    };
    assert.ok(merged.mcpServers["unrelated-tool"]);
    assert.ok(merged.mcpServers["mobile-e2e-mcp"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setup-agent supports full toolset and codex/opencode config shapes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-setup-shapes-"));
  try {
    await captureConsole(() => executeSetupAgent(["--target", "codex", "--toolset", "full"], dir));
    const toml = readFileSync(path.join(dir, ".codex", "config.toml"), "utf-8");
    assert.match(toml, /\[mcp_servers\.mobile-e2e-mcp\]/);
    assert.match(toml, /@shenyuexin\/mobile-e2e-mcp@latest/);
    assert.match(toml, /--toolset", "full/);

    await captureConsole(() => executeSetupAgent(["--target", "opencode"], dir));
    const opencode = JSON.parse(readFileSync(path.join(dir, "opencode.json"), "utf-8")) as {
      mcp: Record<string, { type: string; command: string[]; enabled: boolean }>;
    };
    assert.equal(opencode.mcp["mobile-e2e-mcp"]?.type, "local");
    assert.equal(opencode.mcp["mobile-e2e-mcp"]?.enabled, true);
    assert.match(readFileSync(path.join(dir, "AGENTS.md"), "utf-8"), /mobile-e2e-mcp:begin/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("JSON and TOML merge helpers preserve unrelated entries", () => {
  const merged = mergeJsonMcpConfig(
    JSON.stringify({ mcpServers: { other: { command: "x" } } }),
    "claude",
    "core",
  );
  assert.equal(merged.changed, true);
  const parsed = JSON.parse(merged.content ?? "{}") as { mcpServers: Record<string, unknown> };
  assert.ok(parsed.mcpServers["other"]);
  assert.ok(parsed.mcpServers["mobile-e2e-mcp"]);
  assert.match(mergeJsonMcpConfig("not json", "claude", "core").error ?? "", /not valid JSON/);

  const toml = mergeTomlMcpConfig('[mcp_servers.other]\ncommand = "x"\n', "core", false);
  assert.match(toml.content, /\[mcp_servers\.other\]/);
  assert.match(toml.content, /\[mcp_servers\.mobile-e2e-mcp\]/);
});

test("unified CLI dispatches setup-agent", async () => {
  let called = false;
  await runUnifiedCli(["setup-agent", "--help"], {
    executeSetupAgent: async () => {
      called = true;
      return 0;
    },
  });
  assert.equal(called, true);
  const help = await captureConsole(() => runUnifiedCli(["--help"]));
  assert.match(help.stdout, /mobile-e2e-mcp setup-agent \[options\]/);
});
