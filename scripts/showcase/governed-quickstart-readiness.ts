import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CheckStatus = "pass" | "warn" | "fail";

interface ReadinessCheck {
  name: string;
  status: CheckStatus;
  summary: string;
  details?: Record<string, unknown>;
  nextActions?: string[];
}

interface QuickstartReadiness {
  runId: string;
  generatedAt: string;
  readiness: "live_ready" | "offline_ready" | "blocked";
  checks: ReadinessCheck[];
  recommendedNextCommands: string[];
  outputDir: string;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function timestampId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function inspectAdb(): ReadinessCheck {
  const result = spawnSync("adb", ["devices", "-l"], {
    encoding: "utf8",
    timeout: 5000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const devices = lines
    .filter((line) => !line.startsWith("List of devices"))
    .filter((line) => /\sdevice(\s|$)/.test(line));

  if (result.error) {
    return {
      name: "adb_device_visibility",
      status: "warn",
      summary: "adb could not be executed from this environment.",
      details: {
        error: result.error.message,
      },
      nextActions: [
        "Install Android platform-tools or ensure adb is on PATH.",
        "If this runs inside a sandboxed agent, allow local adb/USB access and rerun quickstart.",
      ],
    };
  }

  if (devices.length > 0) {
    return {
      name: "adb_device_visibility",
      status: "pass",
      summary: "At least one Android device is visible through adb.",
      details: {
        devices,
      },
      nextActions: [
        "Run `pnpm run proof:governed-agent-mobile-control:preflight` before a live proof.",
        "Run `pnpm run proof:governed-business-app-workflow` when the demo app APK is available.",
      ],
    };
  }

  return {
    name: "adb_device_visibility",
    status: "warn",
    summary: "No online Android device is visible through adb.",
    details: {
      exitCode: result.status,
      output,
    },
    nextActions: [
      "Connect an Android device or start an emulator.",
      "Run `adb devices -l` and confirm the device is listed as `device`, not `unauthorized` or `offline`.",
      "Offline evidence validation is still available without a connected device.",
    ],
  };
}

function requiredScriptsPresent(scripts: Record<string, unknown>): ReadinessCheck {
  const required = [
    "proof:governed-agent-mobile-control",
    "proof:governed-agent-mobile-control:preflight",
    "proof:governed-business-app-workflow",
    "validate:governed-control-evidence",
    "validate:governed-business-app-evidence",
    "validate:governed-business-app-comparison",
  ];
  const missing = required.filter((name) => typeof scripts[name] !== "string");
  return {
    name: "governed_scripts",
    status: missing.length === 0 ? "pass" : "fail",
    summary: missing.length === 0
      ? "Governed-control proof and validation scripts are available."
      : "One or more governed-control scripts are missing from package.json.",
    details: {
      required,
      missing,
    },
    nextActions: missing.length === 0
      ? ["Run `pnpm run validate:governed-business-app-comparison` for the fastest offline proof."]
      : ["Restore package.json governed-control scripts before running quickstart."],
  };
}

async function buildReadiness(outputDir: string): Promise<QuickstartReadiness> {
  const root = repoRoot();
  const packageJson = await readJson(path.join(root, "package.json"));
  const scripts = typeof packageJson?.scripts === "object" && packageJson.scripts !== null
    ? packageJson.scripts as Record<string, unknown>
    : {};

  const governedControlSummary = path.join(root, "docs/showcase/evidence/governed-control-vivo-2026-05-23/summary.json");
  const businessSummary = path.join(root, "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/summary.json");
  const businessComparison = path.join(root, "docs/showcase/evidence/governed-business-app-vivo-2026-05-24/comparison.json");
  const demoApk = path.join(root, "examples/demo-android-app/app/build/outputs/apk/debug/app-debug.apk");

  const checks: ReadinessCheck[] = [
    requiredScriptsPresent(scripts),
    {
      name: "tracked_offline_evidence",
      status: await fileExists(governedControlSummary) && await fileExists(businessSummary) && await fileExists(businessComparison)
        ? "pass"
        : "fail",
      summary: "Tracked governed-control and business-app evidence files are available for offline validation.",
      details: {
        governedControlSummary: path.relative(root, governedControlSummary),
        businessSummary: path.relative(root, businessSummary),
        businessComparison: path.relative(root, businessComparison),
      },
      nextActions: [
        "Run `pnpm run validate:governed-control-evidence`.",
        "Run `pnpm run validate:governed-business-app-evidence`.",
        "Run `pnpm run validate:governed-business-app-comparison`.",
      ],
    },
    {
      name: "demo_business_app_apk",
      status: await fileExists(demoApk) ? "pass" : "warn",
      summary: await fileExists(demoApk)
        ? "Demo business app APK is available for live workflow setup."
        : "Demo business app APK is missing; live business workflow needs a build or M2E_BUSINESS_APK_PATH override.",
      details: {
        apkPath: path.relative(root, demoApk),
      },
      nextActions: await fileExists(demoApk)
        ? ["Run `pnpm run proof:governed-business-app-workflow` when a device is visible."]
        : ["Build `examples/demo-android-app` or set `M2E_BUSINESS_APK_PATH=<apk>`."],
    },
    inspectAdb(),
  ];

  const hasFailure = checks.some((check) => check.status === "fail");
  const deviceVisible = checks.some((check) => check.name === "adb_device_visibility" && check.status === "pass");
  const apkReady = checks.some((check) => check.name === "demo_business_app_apk" && check.status === "pass");
  const readiness = hasFailure ? "blocked" : deviceVisible && apkReady ? "live_ready" : "offline_ready";
  const recommendedNextCommands = readiness === "live_ready"
    ? [
      "pnpm run proof:governed-agent-mobile-control:preflight",
      "pnpm run proof:governed-business-app-workflow",
    ]
    : readiness === "offline_ready"
      ? [
        "pnpm run validate:governed-control-evidence",
        "pnpm run validate:governed-business-app-evidence",
        "pnpm run validate:governed-business-app-comparison",
      ]
      : [
        "pnpm run validate:governed-business-app-comparison",
      ];

  return {
    runId: path.basename(outputDir),
    generatedAt: new Date().toISOString(),
    readiness,
    checks,
    recommendedNextCommands,
    outputDir: path.relative(root, outputDir),
  };
}

function renderMarkdown(readiness: QuickstartReadiness): string {
  const lines = [
    "# Governed Control Quickstart Readiness",
    "",
    `- Run ID: ${readiness.runId}`,
    `- Generated at: ${readiness.generatedAt}`,
    `- Readiness: ${readiness.readiness}`,
    "",
    "## Checks",
    "",
    ...readiness.checks.map((check) => [
      `### ${check.name}`,
      "",
      `- Status: ${check.status}`,
      `- Summary: ${check.summary}`,
      check.details ? `- Details: \`${JSON.stringify(check.details)}\`` : undefined,
      check.nextActions && check.nextActions.length > 0 ? "- Next actions:" : undefined,
      ...(check.nextActions ?? []).map((action) => `  - ${action}`),
      "",
    ].filter((line): line is string => Boolean(line)).join("\n")),
    "## Recommended Next Commands",
    "",
    ...readiness.recommendedNextCommands.map((command) => `- \`${command}\``),
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const root = repoRoot();
  const runId = process.env.M2E_QUICKSTART_RUN_ID ?? timestampId();
  const outputDir = path.join(root, "output/showcase/governed-quickstart-readiness", runId);
  await mkdir(outputDir, { recursive: true });

  const readiness = await buildReadiness(outputDir);
  await writeFile(path.join(outputDir, "quickstart-readiness.json"), `${JSON.stringify(readiness, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDir, "report.md"), renderMarkdown(readiness), "utf8");

  console.log(`Governed control quickstart readiness written to ${readiness.outputDir}`);
  console.log(JSON.stringify({
    runId: readiness.runId,
    outputDir: readiness.outputDir,
    readiness: readiness.readiness,
    checks: readiness.checks.map((check) => ({ name: check.name, status: check.status })),
    recommendedNextCommands: readiness.recommendedNextCommands,
  }, null, 2));

  if (readiness.readiness === "blocked" && process.env.M2E_QUICKSTART_ALLOW_BLOCKED !== "1") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
