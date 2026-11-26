import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runUnifiedCli } from "../src/cli/unified-cli.ts";
import { executeVerify, parseVerifyArgs } from "../src/cli/verify-command.ts";

function result(data: Record<string, unknown> = {}, status: "success" | "failed" = "success") {
  return {
    status,
    reasonCode: status === "success" ? "OK" : "FLOW_FAILED",
    sessionId: "verify-sess",
    durationMs: 10,
    attempts: 1,
    artifacts: [],
    data: { sessionId: "verify-sess", ...data },
    nextSuggestions: status === "failed" ? ["Inspect selector and retry."] : [],
  };
}

function makeVerifyServer(opts: { failFlowName?: string; auditRegression?: boolean } = {}) {
  const invocations: Array<{ tool: string; input: Record<string, unknown> }> = [];
  const server = {
    invoke: async (tool: string, input: Record<string, unknown>) => {
      invocations.push({ tool, input });
      if (tool === "start_session") return result();
      if (tool === "record_screen") {
        return result({
          mode: input.mode,
          recordingId: "rec-verify",
          discarded: Boolean(input.discardOnStop),
          outputPath: String(input.outputPath ?? ""),
        });
      }
      if (tool === "run_flow") {
        const flowPath = String(input.flowPath ?? "");
        const shouldFail = Boolean(opts.failFlowName && flowPath.includes(opts.failFlowName));
        return result({ durationMs: 15 }, shouldFail ? "failed" : "success");
      }
      if (tool === "explain_last_failure") {
        return result({ found: true, actionId: "act-v1", attribution: { mostLikelyCause: "missing button" } });
      }
      if (tool === "suggest_known_remediation") {
        return result({ found: true, remediation: ["Use stable resourceId"] });
      }
      if (tool === "inspect_ui") {
        return result({
          summary: {
            sampleNodes: [{ resourceId: "btn_submit", clickable: true, enabled: true, scrollable: false }],
          },
        });
      }
      if (tool === "audit_ui_surface") {
        return result({
          dryRun: Boolean(input.dryRun),
          surfaceName: "HomeScreen",
          totalNodes: 20,
          issueCounts: { total: opts.auditRegression ? 2 : 0 },
          baselineDiff: {
            baselinePath: ".e2e/ui-baseline.json",
            mode: "compare",
            baselineFound: true,
            matchedSurface: true,
            baselineUpdated: false,
            newRegressions: opts.auditRegression
              ? [{ category: "severeSmallTargets", fingerprint: "fp", delta: 1, baselineCount: 0, currentCount: 1 }]
              : [],
            newIssueCounts: { total: opts.auditRegression ? 1 : 0 },
          },
        });
      }
      return result();
    },
  } as never;
  return { server, invocations };
}

async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> {
  const originalLog = console.log;
  const originalErr = console.error;
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  console.log = (...args: unknown[]) => stdoutLines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderrLines.push(args.map(String).join(" "));
  try {
    return { result: await fn(), stdout: stdoutLines.join("\n"), stderr: stderrLines.join("\n") };
  } finally {
    console.log = originalLog;
    console.error = originalErr;
  }
}

test("parseVerifyArgs validates flags and rejects unknown options", () => {
  const parsed = parseVerifyArgs([
    "--flows", "flows/a.yaml",
    "--flows", "flows/dir",
    "--audit",
    "--no-explore",
    "--fail-fast",
    "--fail-on-regression",
    "--output", "out/verify",
    "--json",
  ]);
  assert.deepEqual(parsed.flows, ["flows/a.yaml", "flows/dir"]);
  assert.equal(parsed.audit, true);
  assert.equal(parsed.explore, false);
  assert.equal(parsed.failFast, true);
  assert.equal(parsed.failOnRegression, true);
  assert.equal(parsed.output, "out/verify");
  assert.equal(parsed.json, true);

  assert.match(parseVerifyArgs(["--bogus"]).error ?? "", /Unknown option/);
  assert.match(parseVerifyArgs(["--flows"]).error ?? "", /Missing value/);
  assert.match(parseVerifyArgs(["positional"]).error ?? "", /Unexpected argument/);
});

test("executeVerify orchestrates flows directory, UI audit, and Explorer into unified reports", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-verify-full-"));
  try {
    const flowsDir = path.join(dir, "flows");
    await mkdir(path.join(dir, ".e2e"), { recursive: true });
    await mkdir(flowsDir, { recursive: true });
    await writeFile(path.join(flowsDir, "01-a.yaml"), "appId: com.example.verify\n---\n- launchApp\n", "utf-8");
    await writeFile(path.join(flowsDir, "02-b.yaml"), "appId: com.example.verify\n---\n- launchApp\n", "utf-8");
    await writeFile(
      path.join(dir, ".e2e", "config.yaml"),
      [
        "version: 1",
        "platform: ios",
        "appId: com.example.verify",
        "verify:",
        "  flows:",
        "    - flows",
        "  audit: true",
        "  explore: true",
        "",
      ].join("\n"),
      "utf-8",
    );

    const { server } = makeVerifyServer();
    const outDir = path.join(dir, "verify-out");
    const captured = await captureConsole(() =>
      executeVerify(
        server,
        ["--output", outDir, "--json"],
        {
          runExplore: async (_srv, input) => {
            const runId = input.runId ?? "run-1";
            const runDir = path.join(input.reportDir ?? outDir, runId);
            await mkdir(runDir, { recursive: true });
            const htmlPath = path.join(runDir, "report.html");
            const summaryPath = path.join(runDir, "summary.json");
            await writeFile(htmlPath, "<!doctype html><html><body>explorer</body></html>", "utf-8");
            await writeFile(summaryPath, "{}", "utf-8");
            return {
              success: true,
              exitCode: 0,
              visitedPages: 7,
              failedCount: 0,
              durationMs: 120,
              reportPath: path.join(input.reportDir ?? outDir, "index.json"),
              runId,
              runDir,
              reportHtmlPath: htmlPath,
              summaryJsonPath: summaryPath,
              stage: "complete",
            };
          },
        },
        dir,
      ),
    );

    assert.equal(captured.result, 0);
    const summary = JSON.parse(captured.stdout) as {
      overallStatus: string;
      flows: { passed: number; total: number };
      audit: { status: string };
      explorer: { status: string; visitedPages: number; htmlReportRelPath: string };
      artifacts: { summaryJsonPath: string; reportMdPath: string; reportHtmlPath: string };
    };
    assert.equal(summary.overallStatus, "passed");
    assert.equal(summary.flows.passed, 2);
    assert.equal(summary.flows.total, 2);
    assert.equal(summary.audit.status, "passed");
    assert.equal(summary.explorer.status, "passed");
    assert.equal(summary.explorer.visitedPages, 7);
    assert.match(summary.explorer.htmlReportRelPath, /^explore\/.+\/report\.html$/);

    assert.equal(existsSync(summary.artifacts.summaryJsonPath), true);
    assert.equal(existsSync(summary.artifacts.reportMdPath), true);
    assert.equal(existsSync(summary.artifacts.reportHtmlPath), true);

    const md = await readFile(summary.artifacts.reportMdPath, "utf-8");
    assert.match(md, /explore\/.+\/report\.html/);
    const html = await readFile(summary.artifacts.reportHtmlPath, "utf-8");
    assert.match(html, /^<!doctype html>/);
    assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)\s*=\s*["']https?:/i);
    assert.match(html, /2\/2/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("executeVerify fails exit code 1 on flow failure or audit regression and handles --dry-run", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-verify-fail-"));
  try {
    const flowPath = path.join(dir, "smoke.yaml");
    await writeFile(flowPath, 'appId: "com.example.fail"\n---\n- tapOn: "Missing"\n', "utf-8");

    const { server } = makeVerifyServer({ failFlowName: "smoke.yaml", auditRegression: true });
    const outDir = path.join(dir, "out-fail");
    const failedRun = await captureConsole(() =>
      executeVerify(
        server,
        ["--flows", flowPath, "--audit", "--explore", "--app-id", "com.example.fail", "--fail-on-regression", "--dry-run", "--output", outDir, "--json"],
        { runExplore: async () => { throw new Error("should skip under dry-run"); } },
        dir,
      ),
    );
    assert.equal(failedRun.result, 1);
    const parsed = JSON.parse(failedRun.stdout) as {
      overallStatus: string;
      flows: { entries: Array<{ healProposal?: { proposalOnly: boolean } }> };
      audit: { status: string; regressionDetected: boolean };
      explorer: { status: string };
    };
    assert.equal(parsed.overallStatus, "failed");
    assert.equal(parsed.flows.entries[0]?.healProposal?.proposalOnly, true);
    assert.equal(parsed.audit.status, "failed");
    assert.equal(parsed.audit.regressionDetected, true);
    assert.equal(parsed.explorer.status, "skipped_dry_run");

    const nothingRun = await captureConsole(() => executeVerify(server, [], {}, dir));
    assert.equal(nothingRun.result, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unified CLI dispatches verify and prints verify usage in help", async () => {
  let called = false;
  const code = await runUnifiedCli(["verify", "--help"], {
    executeVerify: async () => {
      called = true;
      return 0;
    },
  });
  assert.equal(code, 0);
  assert.equal(called, true);

  const help = await captureConsole(() => runUnifiedCli(["--help"]));
  assert.match(help.stdout, /mobile-e2e-mcp verify \[options\]/);
});
