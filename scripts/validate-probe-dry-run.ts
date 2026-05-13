import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface ProbeDryRunReport {
  mode: string;
  probe: string;
  platform: string;
  requiresDevice: boolean;
  plannedTools: string[];
}

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function extractJsonPayload(raw: string): string {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  assert.ok(firstBrace >= 0 && lastBrace > firstBrace, "dry-run output should include a JSON report");
  return raw.slice(firstBrace, lastBrace + 1);
}

async function runProbeDryRun(repoRoot: string, scriptPath: string): Promise<{ stdout: string; report: ProbeDryRunReport }> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", scriptPath, "--dry-run"], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer | string) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer | string) => { err += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(out);
        return;
      }
      reject(new Error(`Probe dry-run failed (${String(code)}): ${err || out}`));
    });
  });

  return {
    stdout,
    report: JSON.parse(extractJsonPayload(stdout)) as ProbeDryRunReport,
  };
}

function validateReport(report: ProbeDryRunReport, expected: { probe: string; platform: string; requiredTools: string[] }): void {
  assert.equal(report.mode, "dry-run");
  assert.equal(report.probe, expected.probe);
  assert.equal(report.platform, expected.platform);
  assert.equal(report.requiresDevice, false);
  assert.ok(Array.isArray(report.plannedTools));
  assert.ok(report.plannedTools.length >= expected.requiredTools.length);
  for (const tool of expected.requiredTools) {
    assert.ok(report.plannedTools.includes(tool), `${expected.probe} should include ${tool}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = repoRootFromScript();
  const android = await runProbeDryRun(repoRoot, "scripts/dev/android-tool-probe.ts");
  const iosSimulator = await runProbeDryRun(repoRoot, "scripts/dev/ios-simulator-tool-probe.ts");

  validateReport(android.report, {
    probe: "android-tool-probe",
    platform: "android",
    requiredTools: ["start_session", "launch_app", "wait_for_ui", "validate_flow", "end_session"],
  });
  validateReport(iosSimulator.report, {
    probe: "ios-simulator-tool-probe",
    platform: "ios",
    requiredTools: ["start_session", "launch_app", "wait_for_ui", "run_flow", "end_session"],
  });

  process.stdout.write(android.stdout);
  process.stdout.write(iosSimulator.stdout);
  console.log("Probe dry-run CI gate validation passed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[validate-probe-dry-run] ${message}`);
  process.exitCode = 1;
});
