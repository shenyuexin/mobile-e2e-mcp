import { exportCanonicalSkills, parseExportCliOptions, repoRootFromScript, resolveInstallTargetPreset } from "./export-canonical-skills-lib.ts";

interface InstallCliOptions {
  preset: "opencode-config" | "opencode-home";
  mode: "copy" | "symlink";
  dryRun: boolean;
  check: boolean;
}

function parseInstallCliOptions(argv: string[]): InstallCliOptions {
  let preset: InstallCliOptions["preset"] = "opencode-config";
  let mode: InstallCliOptions["mode"] = "copy";
  let dryRun = false;
  let check = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--preset") {
      const next = argv[index + 1];
      if (next !== "opencode-config" && next !== "opencode-home") {
        throw new Error(`--preset must be 'opencode-config' or 'opencode-home', got: ${String(next)}`);
      }
      preset = next;
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      const next = argv[index + 1];
      if (next !== "copy" && next !== "symlink") {
        throw new Error(`--mode must be 'copy' or 'symlink', got: ${String(next)}`);
      }
      mode = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { preset, mode, dryRun, check };
}

async function main(): Promise<void> {
  const cliOptions = parseInstallCliOptions(process.argv.slice(2));
  const outDir = resolveInstallTargetPreset(cliOptions.preset);
  const result = await exportCanonicalSkills({
    repoRoot: repoRootFromScript(import.meta.url),
    outDir,
    mode: cliOptions.mode,
    dryRun: cliOptions.dryRun,
    check: cliOptions.check,
  });

  if (cliOptions.check) {
    console.log(`Verified ${String(result.checkedCount)} canonical skill install(s) in preset ${cliOptions.preset}.`);
    return;
  }
  if (cliOptions.dryRun) {
    console.log(`Dry run planned ${String(result.plannedCount)} canonical skill install(s) into preset ${cliOptions.preset}.`);
    return;
  }
  console.log(`Installed ${String(result.exportedCount)} canonical skill(s) into preset ${cliOptions.preset}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
