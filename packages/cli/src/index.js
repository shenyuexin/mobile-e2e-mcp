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
  console.log("Usage: mobile-e2e-mcp [command] [tool flags]");
  console.log("Commands:");
  console.log("  verify-mobile-change        Run one-command mobile change verification.");
  console.log("Examples:");
  console.log("  mobile-e2e-mcp verify-mobile-change --live --run-id=my-run");
  console.log("  mobile-e2e-mcp --describe-capabilities --platform ios --runner-profile phase1");
  console.log("  mobile-e2e-mcp --perform-action-with-evidence --platform android --action-type tap_element --content-desc \"View products\" --dry-run");
  console.log("  mobile-e2e-mcp --run-count 1 --flow-path flows/samples/react-native/android-login-smoke.yaml --dry-run");
  console.log("Pass-through: forwards all flags to @shenyuexin/mobile-e2e-mcp dev CLI.");
}

export function buildMobileChangeVerifyCommand(repoRoot, args) {
  return {
    command: "pnpm",
    args: [
      "--dir",
      repoRoot,
      "exec",
      "tsx",
      "scripts/showcase/mobile-change-one-command.ts",
      ...args,
    ],
  };
}

function buildPassThroughCommand(repoRoot, args) {
  return {
    command: "pnpm",
    args: ["--dir", repoRoot, "--filter", "@shenyuexin/mobile-e2e-mcp", "dev", "--", ...args],
  };
}

async function runCommand(invocation) {
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, { stdio: "inherit" });
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
  const invocation = argv[0] === "verify-mobile-change"
    ? buildMobileChangeVerifyCommand(repoRoot, argv.slice(1))
    : buildPassThroughCommand(repoRoot, argv);
  await runCommand(invocation);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
