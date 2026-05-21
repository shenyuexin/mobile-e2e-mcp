import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateAndroidExplorerEvidence,
  type AndroidExplorerEvidenceExpectations,
} from "./android-evidence-validator.ts";

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function readNumberFlag(argv: string[], name: string): number | undefined {
  const raw = readFlag(argv, name);
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

function printHelp(): void {
  console.log(`
Usage:
  pnpm run validate:explorer-android-evidence -- [artifact-dir] [options]

Default artifact dir:
  artifacts/explorer/android-full/2026-04-28T03-38-20

Options:
  --app-id <id>          Expected app id (default: com.android.settings)
  --platform <platform>  Expected platform (default: android-device)
  --mode <mode>          Expected Explorer mode (default: full)
  --min-pages <n>        Minimum pages discovered (default: 1)
  --max-failures <n>     Maximum failures allowed (default: 0)
  --min-depth <n>        Minimum max depth reached (default: 1)
`);
}

function parseArgs(argv: string[]): { artifactDir: string; expectations: AndroidExplorerEvidenceExpectations } {
  argv = argv.filter((arg) => arg !== "--");

  if (argv.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const repoRoot = repoRootFromScript();
  let positional: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      index++;
      continue;
    }
    positional = arg;
    break;
  }
  const artifactDir = positional
    ? path.resolve(repoRoot, positional)
    : path.join(repoRoot, "artifacts/explorer/android-full/2026-04-28T03-38-20");

  return {
    artifactDir,
    expectations: {
      appId: readFlag(argv, "--app-id"),
      platform: readFlag(argv, "--platform"),
      mode: readFlag(argv, "--mode"),
      minPages: readNumberFlag(argv, "--min-pages"),
      maxFailures: readNumberFlag(argv, "--max-failures"),
      minDepth: readNumberFlag(argv, "--min-depth"),
    },
  };
}

try {
  const { artifactDir, expectations } = parseArgs(process.argv.slice(2));
  const report = validateAndroidExplorerEvidence(artifactDir, expectations);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[validate-android-explorer-evidence] ${message}`);
  process.exitCode = 1;
}
