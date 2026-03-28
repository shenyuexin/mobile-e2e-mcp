import { exportCanonicalSkills, parseExportCliOptions, repoRootFromScript } from "./export-canonical-skills-lib.ts";

async function main(): Promise<void> {
  const cliOptions = parseExportCliOptions(process.argv.slice(2));
  const result = await exportCanonicalSkills({
    repoRoot: repoRootFromScript(import.meta.url),
    outDir: cliOptions.outDir,
    mode: cliOptions.mode,
    dryRun: cliOptions.dryRun,
    check: cliOptions.check,
  });

  if (cliOptions.check) {
    console.log(`Verified ${String(result.checkedCount)} canonical skill export(s).`);
    return;
  }
  if (cliOptions.dryRun) {
    console.log(`Dry run planned ${String(result.plannedCount)} canonical skill export(s) in ${cliOptions.mode} mode.`);
    return;
  }
  console.log(`Exported ${String(result.exportedCount)} canonical skill(s) to ${cliOptions.outDir}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
