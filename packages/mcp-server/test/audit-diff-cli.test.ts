import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { RunComparison } from "@mobile-e2e-mcp/explorer";
import {
  executeAudit,
  hasUiAuditRegression,
  parseAuditArgs,
} from "../src/cli/audit-command.ts";
import { executeDiff, parseDiffArgs } from "../src/cli/diff-command.ts";
import { runUnifiedCli } from "../src/cli/unified-cli.ts";

interface Invocation {
  tool: string;
  input: Record<string, unknown>;
}

function okResult(data: Record<string, unknown> = {}) {
  return {
    status: "success",
    reasonCode: "OK",
    sessionId: "sess-1",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: { sessionId: "sess-1", ...data },
    nextSuggestions: [],
  };
}

function auditData(regressed: boolean) {
  return {
    dryRun: true,
    surfaceName: "paywall",
    totalNodes: 4,
    issueCounts: { total: 4 },
    baselineDiff: {
      baselinePath: ".e2e/ui-baseline.json",
      mode: "compare",
      baselineFound: true,
      matchedSurface: true,
      baselineUpdated: false,
      newRegressions: regressed
        ? [{ category: "severeSmallTargets", fingerprint: "fp-1", delta: 1, baselineCount: 0, currentCount: 1 }]
        : [],
      newIssueCounts: { total: regressed ? 1 : 0 },
      preExistingIssueCounts: { total: 0 },
      resolvedIssueCounts: { total: 0 },
      resolvedItems: [],
    },
  };
}

function makeServer(auditResult: ReturnType<typeof okResult>) {
  const invocations: Invocation[] = [];
  const server = {
    invoke: async (tool: string, input: Record<string, unknown>) => {
      invocations.push({ tool, input });
      if (tool === "audit_ui_surface") return auditResult;
      return okResult();
    },
  } as never;
  return { server, invocations };
}

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

test("parseAuditArgs parses every documented flag", () => {
  const options = parseAuditArgs([
    "--platform", "ios",
    "--device-id", "SIM-1",
    "--app-id", "com.example.app",
    "--baseline-path", ".e2e/ui-baseline.json",
    "--baseline-mode", "update",
    "--output", "artifacts/audit.json",
    "--config", "custom.yaml",
    "--dry-run",
    "--json",
    "--fail-on-regression",
    "--help",
  ]);
  assert.equal(options.platform, "ios");
  assert.equal(options.deviceId, "SIM-1");
  assert.equal(options.appId, "com.example.app");
  assert.equal(options.baselinePath, ".e2e/ui-baseline.json");
  assert.equal(options.baselineMode, "update");
  assert.equal(options.output, "artifacts/audit.json");
  assert.equal(options.configPath, "custom.yaml");
  assert.equal(options.dryRun, true);
  assert.equal(options.json, true);
  assert.equal(options.failOnRegression, true);
  assert.equal(options.help, true);
  assert.equal(parseAuditArgs(["--platform", "windows"]).error?.includes("Invalid --platform"), true);
  assert.equal(parseAuditArgs(["--baseline-mode", "nope"]).error?.includes("Invalid --baseline-mode"), true);
});

test("audit runs start_session -> audit_ui_surface -> end_session with .e2e/config.yaml defaults", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-audit-cli-"));
  try {
    await mkdir(path.join(dir, ".e2e"), { recursive: true });
    await writeFile(
      path.join(dir, ".e2e", "config.yaml"),
      [
        "version: 1",
        "platform: android",
        "appId: com.example.app",
        "deviceId: emulator-5554",
        "audit:",
        "  baselinePath: .e2e/ui-baseline.json",
        "  baselineMode: compare",
        "  failOnRegression: true",
        "",
      ].join("\n"),
      "utf-8",
    );

    const { server, invocations } = makeServer(okResult(auditData(true)));
    const captured = await captureConsole(() => executeAudit(server, ["--json"], dir));
    assert.equal(captured.result, 1);
    assert.deepEqual(
      invocations.map((item) => item.tool),
      ["start_session", "audit_ui_surface", "end_session"],
    );
    assert.equal(invocations[0]?.input.appId, "com.example.app");
    assert.equal(invocations[0]?.input.deviceId, "emulator-5554");
    assert.equal(invocations[1]?.input.baselinePath, ".e2e/ui-baseline.json");
    assert.equal(invocations[1]?.input.baselineMode, "compare");
    const payload = JSON.parse(captured.stdout) as {
      regressionDetected: boolean;
      exitCode: number;
      startResult: unknown;
      endResult: unknown;
    };
    assert.equal(payload.regressionDetected, true);
    assert.equal(payload.exitCode, 1);
    assert.ok(payload.startResult && payload.endResult);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("audit --fail-on-regression controls the exit code and --json emits structured output", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-audit-exit-"));
  try {
    const regressed = makeServer(okResult(auditData(true)));
    assert.equal(await executeAudit(regressed.server, ["--fail-on-regression", "--dry-run"], dir), 1);

    const clean = makeServer(okResult(auditData(false)));
    assert.equal(await executeAudit(clean.server, ["--fail-on-regression", "--dry-run"], dir), 0);

    const unguarded = makeServer(okResult(auditData(true)));
    assert.equal(await executeAudit(unguarded.server, ["--dry-run"], dir), 0);

    const failedResult = { ...okResult(auditData(false)), status: "failed" };
    const failed = makeServer(failedResult);
    assert.equal(await executeAudit(failed.server, ["--dry-run"], dir), 1);

    assert.equal(hasUiAuditRegression(failedResult), true);
    assert.equal(hasUiAuditRegression(okResult(auditData(false))), false);

    const jsonRun = makeServer(okResult(auditData(false)));
    const captured = await captureConsole(() =>
      executeAudit(jsonRun.server, ["--json", "--dry-run"], dir),
    );
    const payload = JSON.parse(captured.stdout) as { auditResult: { status: string }; exitCode: number };
    assert.equal(payload.auditResult.status, "success");
    assert.equal(payload.exitCode, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parseDiffArgs parses positional and option flags", () => {
  const options = parseDiffArgs([
    "base", "head", "--markdown", "diff.md", "--html", "diff.html", "--json", "--fail-on-regression",
  ]);
  assert.equal(options.baseDir, "base");
  assert.equal(options.headDir, "head");
  assert.equal(options.markdown, "diff.md");
  assert.equal(options.html, "diff.html");
  assert.equal(options.json, true);
  assert.equal(options.failOnRegression, true);
  assert.equal(parseDiffArgs(["only-one"]).error, undefined);
});

test("diff writes Markdown/HTML, emits JSON, and gates on hasRegressions", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-diff-cli-"));
  try {
    const comparison = {
      hasRegressions: true,
      baseRunId: "base",
      headRunId: "head",
      newPages: ["p1"],
    } as unknown as RunComparison;
    const writes: Record<string, string> = {};
    let received: string[] = [];

    const captured = await captureConsole(() =>
      executeDiff(
        ["base", "head", "--markdown", "out/diff.md", "--html", "out/diff.html", "--json", "--fail-on-regression"],
        {
          computeRunDiff: async (baseDir, headDir) => {
            received = [baseDir, headDir];
            return comparison;
          },
          formatDiffMarkdown: () => "# diff report",
          generateHtmlReport: () => "<!doctype html><html>report</html>",
          writeFile: (filePath, data) => {
            writes[path.relative(dir, filePath)] = data;
          },
        },
        dir,
      ),
    );

    assert.equal(captured.result, 1);
    assert.deepEqual(received, [path.join(dir, "base"), path.join(dir, "head")]);
    assert.equal(writes[path.join("out", "diff.md")], "# diff report");
    assert.match(writes[path.join("out", "diff.html")] ?? "", /<!doctype html>/);
    assert.match(captured.stdout, /"hasRegressions": true/);

    const clean = await executeDiff(
      ["base", "head"],
      {
        computeRunDiff: async () => ({ ...comparison, hasRegressions: false }),
        formatDiffMarkdown: () => "# clean",
      },
      dir,
    );
    assert.equal(clean, 0);

    assert.equal(await executeDiff(["only-one"], {}, dir), 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unified CLI dispatches audit and diff subcommands", async () => {
  let auditCalled = false;
  let diffCalled = false;
  await runUnifiedCli(["audit", "--help"], {
    executeAudit: async () => {
      auditCalled = true;
      return 0;
    },
    executeDiff: async () => {
      diffCalled = true;
      return 0;
    },
  });
  assert.equal(auditCalled, true);
  assert.equal(diffCalled, false);
  await runUnifiedCli(["diff", "base", "head"], {
    executeAudit: async () => 0,
    executeDiff: async () => {
      diffCalled = true;
      return 0;
    },
  });
  assert.equal(diffCalled, true);

  const help = await captureConsole(() => runUnifiedCli(["--help"]));
  assert.match(help.stdout, /mobile-e2e-mcp audit \[options\]/);
  assert.match(help.stdout, /mobile-e2e-mcp diff <baseDir> <headDir>/);
});
