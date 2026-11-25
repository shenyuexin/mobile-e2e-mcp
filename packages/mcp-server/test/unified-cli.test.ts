import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DoctorData, ToolResult } from "@mobile-e2e-mcp/contracts";
import { formatDoctorReport } from "../src/cli/doctor-command.ts";
import { executeInit } from "../src/cli/init-command.ts";
import {
  DEFAULT_PROJECT_CONFIG_PATH,
  loadProjectConfig,
  parseProjectConfigYaml,
  serializeProjectConfigYaml,
  type ProjectE2EConfig,
} from "../src/cli/project-config.ts";
import { normalizeExploreArgs, runUnifiedCli } from "../src/cli/unified-cli.ts";
import { resolveMcpServerVersion } from "../src/constants/version.ts";

async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string; stderr: string }> {
  const originalLog = console.log;
  const originalError = console.error;
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  console.log = (...args: unknown[]) => stdoutLines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderrLines.push(args.map(String).join(" "));
  try {
    const result = await fn();
    return {
      result,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("project-config serializes and parses YAML round-trip cleanly", () => {
  const original: ProjectE2EConfig = {
    version: 1,
    platform: "ios",
    appId: "com.example.notes",
    deviceId: "SIM-UDID-1",
    runnerProfile: "native_ios",
    policyProfile: "interactive",
    flowPath: "flows/smoke.yaml",
    toolset: "core",
    launchEnv: {
      APP_TESTING: "1",
      DEBUG_URL: "http://127.0.0.1:8080/health",
    },
    hooks: {
      healthUrl: "http://127.0.0.1:8080/health",
      logsUrl: "http://127.0.0.1:8080/logs",
    },
    explorer: {
      mode: "scoped",
      maxDepth: 6,
      output: "./artifacts/explorer",
    },
  };

  const yaml = serializeProjectConfigYaml(original);
  const parsed = parseProjectConfigYaml(yaml);
  assert.deepEqual(parsed, original);
});

test("executeInit scaffolds .e2e/config.yaml, guards overwrite, and supports --force", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "m2e-init-test-"));
  try {
    const firstRun = await captureConsole(() =>
      executeInit(["--no-prompt", "--platform", "ios", "--app-id", "com.acme.ios"], {
        cwd: tempDir,
        isInteractive: false,
      }),
    );
    assert.equal(firstRun.result.exitCode, 0);
    const configPath = path.join(tempDir, DEFAULT_PROJECT_CONFIG_PATH);
    assert.equal(existsSync(configPath), true);

    const loaded = await loadProjectConfig(tempDir);
    assert.equal(loaded?.config.platform, "ios");
    assert.equal(loaded?.config.appId, "com.acme.ios");
    assert.equal(loaded?.config.runnerProfile, "native_ios");

    const secondRun = await captureConsole(() =>
      executeInit(["--no-prompt", "--platform", "android", "--app-id", "com.acme.android"], {
        cwd: tempDir,
        isInteractive: false,
      }),
    );
    assert.equal(secondRun.result.exitCode, 1);
    assert.match(secondRun.stderr, /--force/);

    const forcedRun = await captureConsole(() =>
      executeInit(
        ["--no-prompt", "--force", "--platform", "android", "--app-id", "com.acme.android"],
        { cwd: tempDir, isInteractive: false },
      ),
    );
    assert.equal(forcedRun.result.exitCode, 0);
    const reloaded = await loadProjectConfig(tempDir);
    assert.equal(reloaded?.config.platform, "android");
    assert.equal(reloaded?.config.appId, "com.acme.android");
    assert.equal(reloaded?.config.runnerProfile, "native_android");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("formatDoctorReport renders checks, devices, and remediation guidance", () => {
  const sample: ToolResult<DoctorData> = {
    status: "partial",
    reasonCode: "CONFIGURATION_ERROR",
    sessionId: "doctor-test",
    durationMs: 42,
    attempts: 1,
    artifacts: [],
    data: {
      checks: [
        { name: "node", status: "pass", detail: "v22.0.0" },
        { name: "axe", status: "warn", detail: "axe not found on PATH" },
      ],
      devices: {
        android: [{ id: "emulator-5554", name: "Pixel 8", platform: "android", state: "device", available: true }],
        ios: [],
      },
      guidance: [
        {
          dependency: "axe",
          status: "warn",
          platformScope: "ios",
          installCommands: ["brew install axe"],
          verifyCommands: ["axe --version"],
          envHints: [],
        },
      ],
    },
    nextSuggestions: ["Install axe for iOS simulator actions."],
  };

  const text = formatDoctorReport(sample);
  assert.match(text, /\[PASS\] node: v22\.0\.0/);
  assert.match(text, /\[WARN\] axe: axe not found on PATH/);
  assert.match(text, /Devices detected: Android=1, iOS=0/);
  assert.match(text, /brew install axe/);
});

test("normalizeExploreArgs maps short platforms and applies project config without overriding CLI flags", () => {
  const config: ProjectE2EConfig = {
    version: 1,
    platform: "ios",
    appId: "com.acme.app",
    deviceId: "SIM-1",
    launchEnv: { TEST_MODE: "1" },
    explorer: { mode: "smoke", maxDepth: 4, output: "./out" },
  };

  const normalizedFromConfig = normalizeExploreArgs(["--no-prompt"], config);
  assert.deepEqual(normalizedFromConfig, [
    "--no-prompt",
    "--app-id",
    "com.acme.app",
    "--platform",
    "ios-simulator",
    "--device-id",
    "SIM-1",
    "--mode",
    "smoke",
    "--max-depth",
    "4",
    "--output",
    "./out",
    "--launch-env",
    "TEST_MODE=1",
  ]);

  const normalizedOverride = normalizeExploreArgs(
    ["--platform", "android", "--app-id", "com.override.app", "--no-prompt"],
    config,
  );
  assert.equal(normalizedOverride.includes("android-emulator"), true);
  assert.equal(normalizedOverride.includes("ios-simulator"), false);
  assert.equal(normalizedOverride.includes("com.override.app"), true);
  assert.equal(normalizedOverride.includes("com.acme.app"), false);
});

test("runUnifiedCli dispatches help, version, stdio, explore, unknown command, and run --dry-run", async () => {
  const helpOut = await captureConsole(() => runUnifiedCli(["--help"]));
  assert.equal(helpOut.result, 0);
  assert.match(helpOut.stdout, /--toolset core\|full/);
  assert.match(helpOut.stdout, /doctor/);
  assert.match(helpOut.stdout, /init/);
  assert.match(helpOut.stdout, /explore/);
  assert.match(helpOut.stdout, /run/);

  const versionOut = await captureConsole(() => runUnifiedCli(["--version"]));
  assert.equal(versionOut.result, 0);
  assert.equal(versionOut.stdout.trim(), resolveMcpServerVersion());

  const unknownOut = await captureConsole(() => runUnifiedCli(["nonexistent-cmd"]));
  assert.equal(unknownOut.result, 2);
  assert.match(unknownOut.stderr, /Unknown command/);

  let stdioCalledWith: string[] | undefined;
  const stdioCode = await runUnifiedCli(["--toolset", "full"], {
    startMcpStdioServer: async (opts) => {
      stdioCalledWith = opts?.argv;
    },
  });
  assert.equal(stdioCode, 0);
  assert.deepEqual(stdioCalledWith, ["--toolset", "full"]);

  const badToolset = await captureConsole(() => runUnifiedCli(["--toolset", "unknown"]));
  assert.equal(badToolset.result, 2);

  let exploreCalledArgs: string[] | undefined;
  const exploreDir = await mkdtemp(path.join(os.tmpdir(), "m2e-explore-cli-"));
  try {
    await mkdir(path.join(exploreDir, ".e2e"), { recursive: true });
    await writeFile(
      path.join(exploreDir, ".e2e", "config.yaml"),
      "version: 1\nplatform: ios\nappId: com.acme.app\n",
      "utf8",
    );
    const exploreCode = await runUnifiedCli(
      ["explore", "--platform", "android", "--no-prompt"],
      {
        runExplore: async (args) => {
          exploreCalledArgs = args;
        },
      },
      exploreDir,
    );
    assert.equal(exploreCode, 0);
    assert.ok(exploreCalledArgs?.includes("--platform"));
    assert.ok(exploreCalledArgs?.includes("android-emulator"));
    assert.ok(exploreCalledArgs?.includes("--app-id"));
    assert.ok(exploreCalledArgs?.includes("com.acme.app"));

    const mockInvocations: Array<{ tool: string; input: Record<string, unknown> }> = [];
    const runOut = await captureConsole(() =>
      runUnifiedCli(
        ["run", "flows/samples/react-native/android-login-smoke.yaml", "--dry-run", "--json"],
        {
          createServer: () =>
            ({
              invoke: async (tool: string, input: Record<string, unknown>) => {
                mockInvocations.push({ tool, input });
                if (tool === "start_session") {
                  return {
                    status: "success",
                    reasonCode: "OK",
                    sessionId: "run-cli-sess",
                    durationMs: 1,
                    attempts: 1,
                    artifacts: [],
                    data: { sessionId: "run-cli-sess" },
                    nextSuggestions: [],
                  };
                }
                return {
                  status: "success",
                  reasonCode: "OK",
                  sessionId: "run-cli-sess",
                  durationMs: 2,
                  attempts: 1,
                  artifacts: [],
                  data: {},
                  nextSuggestions: [],
                };
              },
            }) as never,
        },
        exploreDir,
      ),
    );
    assert.equal(runOut.result, 0);
    assert.deepEqual(
      mockInvocations.map((item) => item.tool),
      ["start_session", "run_flow", "end_session"],
    );
    assert.equal(mockInvocations[0]?.input.appId, "com.acme.app");
    assert.equal(mockInvocations[1]?.input.dryRun, true);
  } finally {
    await rm(exploreDir, { recursive: true, force: true });
  }
});
