import {
  buildPromoteVisualBaselineUsage,
  parsePromoteVisualBaselineArgs,
  promoteVisualBaseline,
  UsageRequested,
} from "./promote-visual-baseline-lib.js";

async function main(): Promise<void> {
  const options = parsePromoteVisualBaselineArgs(process.argv.slice(2));
  const result = await promoteVisualBaseline(options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof UsageRequested) {
    console.log(buildPromoteVisualBaselineUsage());
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[promote-visual-baseline] ${message}`);
  process.exitCode = 1;
});
