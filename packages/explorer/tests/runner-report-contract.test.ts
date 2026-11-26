import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runExplore, explore } from "../src/index.js";
import type { InvokableServer } from "../src/mcp-adapter.js";

function makeMockServer(): InvokableServer {
  return {
    invoke: async (toolName: string, _input: unknown) => {
      if (toolName === "inspect_ui") {
        return {
          status: "success",
          reasonCode: "OK",
          sessionId: "exp-sess",
          durationMs: 1,
          attempts: 1,
          artifacts: [],
          data: {
            content: {
              className: "Application",
              accessibilityLabel: "com.example.demo",
              clickable: false,
              enabled: true,
              scrollable: false,
              children: [
                {
                  className: "StaticText",
                  text: "Home",
                  contentDesc: "Home",
                  clickable: false,
                  enabled: true,
                  scrollable: false,
                  children: [],
                },
              ],
            },
          },
          nextSuggestions: [],
        };
      }
      return {
        status: "success",
        reasonCode: "OK",
        sessionId: "exp-sess",
        durationMs: 1,
        attempts: 1,
        artifacts: [],
        data: { stable: true },
        nextSuggestions: [],
      };
    },
  };
}

test("runExplore writes report artifacts once and updates index.json and latest.json", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-explorer-single-report-"));
  try {
    const reportDir = path.join(dir, "explore");
    const result = await runExplore(makeMockServer(), {
      appId: "com.example.demo",
      platform: "ios-simulator",
      mode: "smoke",
      auth: { type: "skip-auth" },
      reportDir,
      runId: "fixed-run-01",
      skipInterview: true,
      maxDepth: 1,
      maxPages: 2,
      timeoutMs: 10_000,
    });

    assert.equal(result.success, true);
    assert.equal(result.runId, "fixed-run-01");
    assert.equal(result.runDir, path.join(reportDir, "fixed-run-01"));
    assert.equal(result.reportHtmlPath, path.join(reportDir, "fixed-run-01", "report.html"));
    assert.equal(result.summaryJsonPath, path.join(reportDir, "fixed-run-01", "summary.json"));
    assert.equal(result.latestJsonPath, path.join(reportDir, "latest.json"));
    assert.equal(existsSync(result.reportHtmlPath!), true);
    assert.equal(existsSync(result.summaryJsonPath!), true);
    assert.equal(existsSync(result.latestJsonPath!), true);

    const index = JSON.parse(await readFile(path.join(reportDir, "index.json"), "utf-8")) as {
      runs: Array<{ id: string; htmlReportPath?: string }>;
    };
    assert.equal(index.runs.length, 1, "runExplore must only write a single index.json entry");
    assert.equal(index.runs[0]?.id, "fixed-run-01");
    assert.equal(index.runs[0]?.htmlReportPath, path.join("fixed-run-01", "report.html"));

    const summary = JSON.parse(await readFile(result.summaryJsonPath!, "utf-8")) as {
      transitionLifecycle?: unknown;
      stateGraph?: unknown;
    };
    assert.ok(summary.transitionLifecycle, "summary.json must preserve transitionLifecycle");
    assert.ok(summary.stateGraph, "summary.json must preserve stateGraph");

    const latest = JSON.parse(await readFile(result.latestJsonPath!, "utf-8")) as {
      runId: string;
      reportHtmlPath: string;
      summaryJsonPath: string;
    };
    assert.equal(latest.runId, "fixed-run-01");
    assert.equal(latest.reportHtmlPath, result.reportHtmlPath);
    assert.equal(latest.summaryJsonPath, result.summaryJsonPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("explore CLI supports --run-id and --json cleanly without noisy logs on stdout", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-explorer-cli-json-"));
  const origLog = console.log;
  const origErr = console.error;
  const origExitCode = process.exitCode;
  const stdoutLines: string[] = [];
  console.log = (...args: unknown[]) => stdoutLines.push(args.map(String).join(" "));
  console.error = () => {};
  try {
    const reportDir = path.join(dir, "explore");
    await explore(
      [
        "--no-prompt",
        "--app-id", "com.example.demo",
        "--platform", "ios-simulator",
        "--mode", "smoke",
        "--output", reportDir,
        "--run-id", "cli-run-01",
        "--json",
      ],
      makeMockServer(),
    );
    assert.equal(process.exitCode, 0);
    const parsed = JSON.parse(stdoutLines.join("\n")) as {
      runId?: string;
      reportHtmlPath?: string;
      latestJsonPath?: string;
    };
    assert.equal(parsed.runId, "cli-run-01");
    assert.equal(parsed.reportHtmlPath, path.join(reportDir, "cli-run-01", "report.html"));
    assert.equal(existsSync(parsed.latestJsonPath!), true);
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exitCode = origExitCode;
    await rm(dir, { recursive: true, force: true });
  }
});
