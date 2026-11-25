#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const UNIFIED_SUBCOMMANDS = new Set(["stdio", "doctor", "init", "explore", "run"]);

function resolveRepoRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "../../..");
}

function printHelp() {
  console.log("mobile-e2e-mcp");
  console.log("Usage: mobile-e2e-mcp [command] [options]");
  console.log("Commands:");
  console.log("  stdio [--toolset core|full] Start MCP stdio server (default: core, 18 tools)");
  console.log("  doctor [--json]             Check local Android/iOS tools and devices");
  console.log("  init [options]              Scaffold .e2e/config.yaml in current directory");
  console.log("  explore [options]           Run automatic app exploration");
  console.log("  run [flowPath] [options]    Run a flow inside a governed session");
  console.log("  verify-mobile-change        Run one-command mobile change verification");
  console.log("Examples:");
  console.log("  mobile-e2e-mcp stdio --toolset full");
  console.log("  mobile-e2e-mcp doctor");
  console.log("  mobile-e2e-mcp init --platform ios --app-id com.example.app --no-prompt");
  console.log("  mobile-e2e-mcp verify-mobile-change --live --run-id=my-run");
  console.log("  mobile-e2e-mcp --describe-capabilities --platform ios --runner-profile phase1");
  console.log("Pass-through: forwards legacy tool flags to @shenyuexin/mobile-e2e-mcp dev CLI.");
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

export function buildUnifiedEntryCommand(repoRoot, args) {
  return {
    command: "pnpm",
    args: [
      "--dir",
      repoRoot,
      "--filter",
      "@shenyuexin/mobile-e2e-mcp",
      "exec",
      "tsx",
      "src/bin-stdio.ts",
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
  const first = argv[0];
  if (argv.length === 0 || first === "--help" || first === "-h") {
    printHelp();
    return;
  }

  if (first === "--version" || first === "-v") {
    console.log("0.0.0");
    return;
  }

  const repoRoot = resolveRepoRoot();
  let invocation;
  if (first === "verify-mobile-change") {
    invocation = buildMobileChangeVerifyCommand(repoRoot, argv.slice(1));
  } else if (UNIFIED_SUBCOMMANDS.has(first) || first === "--toolset" || first.startsWith("--toolset=")) {
    invocation = buildUnifiedEntryCommand(repoRoot, argv);
  } else {
    invocation = buildPassThroughCommand(repoRoot, argv);
  }
  await runCommand(invocation);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
