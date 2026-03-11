#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function resolveRepoRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../..");
}

function printHelp() {
  console.log("mobile-e2e-mcp");
  console.log("Usage: mobile-e2e-mcp [tool flags]");
  console.log("Examples:");
  console.log("  mobile-e2e-mcp --describe-capabilities --platform ios --runner-profile phase1");
  console.log("  mobile-e2e-mcp --perform-action-with-evidence --platform android --action-type tap_element --content-desc \"View products\" --dry-run");
  console.log("  mobile-e2e-mcp --run-count 1 --flow-path flows/samples/react-native/android-login-smoke.yaml --dry-run");
  console.log("Pass-through: forwards all flags to @mobile-e2e-mcp/mcp-server dev CLI.");
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    printHelp();
    return;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    console.log("0.0.0");
    return;
  }

  const repoRoot = resolveRepoRoot();
  await new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--dir", repoRoot, "--filter", "@mobile-e2e-mcp/mcp-server", "dev", "--", ...argv],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exitCode = code ?? 1;
      resolve(undefined);
    });
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
