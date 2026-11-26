import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeRun, parseRunArgs } from "../src/cli/run-command.ts";

interface Invocation {
  tool: string;
  input: Record<string, unknown>;
}

function result(data: Record<string, unknown> = {}, status: "success" | "failed" = "success") {
  return {
    status,
    reasonCode: status === "success" ? "OK" : "FLOW_FAILED",
    sessionId: "run-sess",
    durationMs: 12,
    attempts: 1,
    artifacts: [],
    data: { sessionId: "run-sess", ...data },
    nextSuggestions: [],
  };
}

function makeServer(runStatus: "success" | "failed" = "success") {
  const invocations: Invocation[] = [];
  const server = {
    invoke: async (tool: string, input: Record<string, unknown>) => {
      invocations.push({ tool, input });
      if (tool === "start_session") return result();
      if (tool === "record_screen") {
        return result({
          mode: input.mode,
          recordingId: "rec-1",
          discarded: Boolean(input.discardOnStop),
          outputPath: String(input.outputPath ?? "artifacts/run.mp4"),
        });
      }
      if (tool === "run_flow") return result({ durationMs: 12 }, runStatus);
      if (tool === "explain_last_failure") {
        return result({
          found: true,
          actionId: "act-1",
          attribution: { mostLikelyCause: "stale text selector" },
        });
      }
      if (tool === "suggest_known_remediation") {
        return result({
          found: true,
          remediation: ["Prefer a stable resourceId over visible text"],
          skillGuidance: { firstFix: "replace tapOn text with id" },
        });
      }
      if (tool === "inspect_ui") {
        return result({
          summary: {
            sampleNodes: [
              { resourceId: "login_button", clickable: true, enabled: true, scrollable: false },
              { text: "Login", clickable: false, enabled: true, scrollable: false },
            ],
          },
        });
      }
      return result();
    },
  } as never;
  return { server, invocations };
}

async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    return { result: await fn(), stdout: lines.join("\n") };
  } finally {
    console.log = originalLog;
  }
}

test("parseRunArgs parses record-on-failure, record-output and suggest-heal flags", () => {
  const options = parseRunArgs([
    "flows/smoke.yaml",
    "--record-on-failure",
    "--record-output",
    "artifacts/run.mp4",
    "--suggest-heal",
    "--dry-run",
    "--json",
  ]);
  assert.equal(options.flowPath, "flows/smoke.yaml");
  assert.equal(options.recordOnFailure, true);
  assert.equal(options.recordOutput, "artifacts/run.mp4");
  assert.equal(options.suggestHeal, true);
  assert.equal(options.dryRun, true);
  assert.equal(options.json, true);
});

test("record-on-failure records before run_flow and discards the video on success", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-record-pass-"));
  try {
    const { server, invocations } = makeServer("success");
    const captured = await captureConsole(() =>
      executeRun(server, ["flows/smoke.yaml", "--record-on-failure", "--record-output", "artifacts/pass.mp4"], dir),
    );
    assert.equal(captured.result, 0);
    assert.deepEqual(
      invocations.map((item) => item.tool),
      ["start_session", "record_screen", "run_flow", "record_screen", "end_session"],
    );
    assert.equal(invocations[1]?.input.mode, "start");
    assert.equal(invocations[1]?.input.outputPath, "artifacts/pass.mp4");
    assert.equal(invocations[3]?.input.mode, "stop");
    assert.equal(invocations[3]?.input.discardOnStop, true);
    assert.match(captured.stdout, /recording: discarded \(pass\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("record-on-failure preserves the video on run_flow failure", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-record-fail-"));
  try {
    const { server, invocations } = makeServer("failed");
    const captured = await captureConsole(() =>
      executeRun(server, ["flows/smoke.yaml", "--record-on-failure", "--record-output", "artifacts/fail.mp4"], dir),
    );
    assert.equal(captured.result, 1);
    const stop = invocations.find(
      (item) => item.tool === "record_screen" && item.input.mode === "stop",
    );
    assert.equal(stop?.input.discardOnStop, false);
    assert.match(captured.stdout, /recording: saved: artifacts\/fail\.mp4/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("record-on-failure skips live recording under --dry-run", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-record-dry-"));
  try {
    const { server, invocations } = makeServer("success");
    const captured = await captureConsole(() =>
      executeRun(server, ["flows/smoke.yaml", "--record-on-failure", "--dry-run"], dir),
    );
    assert.equal(captured.result, 0);
    assert.equal(invocations.some((item) => item.tool === "record_screen"), false);
    assert.match(captured.stdout, /recording: skipped under --dry-run/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("suggest-heal emits proposal-only unified diff JSON on failure without editing flow files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-heal-"));
  try {
    const flowPath = path.join(dir, "smoke.yaml");
    const original = ['appId: "com.example.app"', "---", '- tapOn: "Login"', ""].join("\n");
    await writeFile(flowPath, original, "utf-8");

    const { server, invocations } = makeServer("failed");
    const captured = await captureConsole(() =>
      executeRun(server, [flowPath, "--suggest-heal", "--json"], dir),
    );
    assert.equal(captured.result, 1);
    const tools = invocations.map((item) => item.tool);
    assert.ok(tools.includes("explain_last_failure"));
    assert.ok(tools.includes("suggest_known_remediation"));
    assert.ok(tools.includes("inspect_ui"));

    const payload = JSON.parse(captured.stdout) as {
      healProposal?: {
        proposalOnly: boolean;
        actionId: string;
        unifiedDiff: string;
        selectorCandidates: Array<{ field: string; value: string }>;
        sources: Record<string, string>;
      };
    };
    assert.equal(payload.healProposal?.proposalOnly, true);
    assert.equal(payload.healProposal?.actionId, "act-1");
    assert.equal(payload.healProposal?.sources.inspectUi, "used");
    assert.ok(payload.healProposal?.selectorCandidates.some((item) => item.value === "login_button"));
    const diff = payload.healProposal?.unifiedDiff ?? "";
    assert.match(diff, /^--- a\//);
    assert.match(diff, /^\+\+\+ b\//m);
    assert.match(diff, /@@ -\d+,\d+ \+\d+,\d+ @@/);
    assert.match(diff, /^\+# prefer resourceId/m);
    assert.match(diff, /tapOn: "Login"/);

    assert.equal(await readFile(flowPath, "utf-8"), original, "flow YAML must never be mutated");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("suggest-heal is not invoked on a successful run", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-heal-pass-"));
  try {
    const { server, invocations } = makeServer("success");
    assert.equal(await executeRun(server, ["flows/smoke.yaml", "--suggest-heal"], dir), 0);
    const tools = invocations.map((item) => item.tool);
    assert.equal(tools.includes("explain_last_failure"), false);
    assert.equal(tools.includes("suggest_known_remediation"), false);
    assert.equal(tools.includes("inspect_ui"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parseRunArgs rejects unknown flags, missing values, and extra positional arguments", () => {
  assert.match(parseRunArgs(["flows/smoke.yaml", "--bogus"]).error ?? "", /Unknown option/);
  assert.match(parseRunArgs(["--output"]).error ?? "", /Missing value/);
  assert.match(parseRunArgs(["--output", "--json"]).error ?? "", /Missing value/);
  assert.match(parseRunArgs(["flows/a.yaml", "flows/b.yaml"]).error ?? "", /Unexpected argument/);
});

test("run executes directory flows in sorted order, writes output summary, and respects --fail-fast", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-dir-"));
  try {
    const flowsDir = path.join(dir, "flows");
    await import("node:fs/promises").then((fs) => fs.mkdir(flowsDir, { recursive: true }));
    await writeFile(path.join(flowsDir, "02-second.yaml"), "appId: com.example\n---\n- launchApp\n", "utf-8");
    await writeFile(path.join(flowsDir, "01-first.yaml"), "appId: com.example\n---\n- launchApp\n", "utf-8");
    await writeFile(path.join(flowsDir, "notes.txt"), "ignore me", "utf-8");

    const runOrder: string[] = [];
    const server = {
      invoke: async (tool: string, input: Record<string, unknown>) => {
        if (tool === "start_session") return result();
        if (tool === "record_screen") {
          return result({
            mode: input.mode,
            recordingId: "rec-dir",
            discarded: Boolean(input.discardOnStop),
            outputPath: String(input.outputPath ?? ""),
          });
        }
        if (tool === "run_flow") {
          const flowPath = String(input.flowPath);
          runOrder.push(flowPath);
          const status = flowPath.includes("01-first") ? "failed" : "success";
          return result({ durationMs: 5 }, status);
        }
        return result();
      },
    } as never;

    const outDir = path.join(dir, "out-all");
    const allRun = await captureConsole(() =>
      executeRun(server, [flowsDir, "--output", outDir, "--record-on-failure", "--json"], dir),
    );
    assert.equal(allRun.result, 1);
    assert.deepEqual(runOrder, ["flows/01-first.yaml", "flows/02-second.yaml"]);
    const summaryPayload = JSON.parse(await readFile(path.join(outDir, "summary.json"), "utf-8")) as {
      mode: string;
      totalFlows: number;
      passedFlows: number;
      failedFlows: number;
      flows: Array<{ recording: { outputPath: string; discarded: boolean } }>;
    };
    assert.equal(summaryPayload.mode, "directory");
    assert.equal(summaryPayload.totalFlows, 2);
    assert.equal(summaryPayload.passedFlows, 1);
    assert.equal(summaryPayload.failedFlows, 1);
    assert.equal(summaryPayload.flows[0]?.recording.outputPath, "out-all/videos/01-01-first.mp4");
    assert.equal(summaryPayload.flows[0]?.recording.discarded, false);
    assert.equal(summaryPayload.flows[1]?.recording.discarded, true);

    runOrder.length = 0;
    const fastFail = await captureConsole(() =>
      executeRun(server, [flowsDir, "--fail-fast"], dir),
    );
    assert.equal(fastFail.result, 1);
    assert.deepEqual(runOrder, ["flows/01-first.yaml"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("single-file run --output writes summary.json while preserving stdout JSON contract", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "m2e-run-single-out-"));
  try {
    const { server } = makeServer("success");
    const captured = await captureConsole(() =>
      executeRun(server, ["flows/smoke.yaml", "--output", "out-single", "--json"], dir),
    );
    assert.equal(captured.result, 0);
    const stdoutJson = JSON.parse(captured.stdout) as {
      startResult: unknown;
      runResult: { status: string };
      endResult: unknown;
      summaryJsonPath?: string;
    };
    assert.ok(stdoutJson.startResult);
    assert.equal(stdoutJson.runResult.status, "success");
    assert.ok(stdoutJson.endResult);
    assert.equal(stdoutJson.summaryJsonPath, path.join(dir, "out-single", "summary.json"));
    const diskJson = JSON.parse(await readFile(stdoutJson.summaryJsonPath!, "utf-8")) as {
      runResult: { status: string };
    };
    assert.equal(diskJson.runResult.status, "success");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
