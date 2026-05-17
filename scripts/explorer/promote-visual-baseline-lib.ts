import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export interface PromoteVisualBaselineOptions {
  candidatePath?: string;
  baselinePath?: string;
  reviewPath?: string;
  failureIndex?: number;
  dryRun?: boolean;
  force?: boolean;
  cwd?: string;
}

export interface PromoteVisualBaselineResult {
  promoted: boolean;
  dryRun: boolean;
  candidatePath: string;
  baselinePath: string;
  overwritten: boolean;
}

interface FailureReviewEvidence {
  baselineCandidatePath?: string;
  baselinePath?: string;
}

interface FailureReviewEntry {
  visualEvidence?: FailureReviewEvidence;
}

interface FailureReviewJson {
  failedElements?: FailureReviewEntry[];
}

export function parsePromoteVisualBaselineArgs(argv: string[]): PromoteVisualBaselineOptions {
  const options: PromoteVisualBaselineOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--candidate":
        options.candidatePath = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--baseline":
        options.baselinePath = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--from-review":
        options.reviewPath = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--failure-index":
        options.failureIndex = parseFailureIndex(requireValue(argv, index, arg));
        index += 1;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--help":
      case "-h":
        throw new UsageRequested();
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

export class UsageRequested extends Error {
  constructor() {
    super("Usage requested");
  }
}

export function buildPromoteVisualBaselineUsage(): string {
  return [
    "Usage:",
    "  pnpm explorer:promote-baseline --from-review <failure-review.json> [--failure-index 1] [--dry-run] [--force]",
    "  pnpm explorer:promote-baseline --candidate <candidate.png> --baseline <baseline.png> [--dry-run] [--force]",
    "",
    "Notes:",
    "  --failure-index is 1-based and defaults to the first failed element with a baselineCandidatePath.",
    "  Existing baselines are not overwritten unless --force is provided.",
  ].join("\n");
}

export async function promoteVisualBaseline(
  rawOptions: PromoteVisualBaselineOptions,
): Promise<PromoteVisualBaselineResult> {
  const cwd = rawOptions.cwd ?? process.cwd();
  const resolved = rawOptions.reviewPath
    ? await resolveFromReview(rawOptions, cwd)
    : resolveDirect(rawOptions, cwd);

  await assertReadableFile(resolved.candidatePath, "candidate");
  const baselineExists = await fileExists(resolved.baselinePath);
  if (baselineExists && !rawOptions.force) {
    throw new Error(
      `Baseline already exists: ${resolved.baselinePath}. Pass --force to overwrite after review.`,
    );
  }

  if (!rawOptions.dryRun) {
    await mkdir(path.dirname(resolved.baselinePath), { recursive: true });
    await copyFile(resolved.candidatePath, resolved.baselinePath);
  }

  return {
    promoted: !rawOptions.dryRun,
    dryRun: Boolean(rawOptions.dryRun),
    candidatePath: resolved.candidatePath,
    baselinePath: resolved.baselinePath,
    overwritten: baselineExists,
  };
}

function resolveDirect(
  options: PromoteVisualBaselineOptions,
  cwd: string,
): { candidatePath: string; baselinePath: string } {
  if (!options.candidatePath || !options.baselinePath) {
    throw new Error("Provide either --from-review or both --candidate and --baseline.");
  }
  return {
    candidatePath: resolvePath(cwd, options.candidatePath),
    baselinePath: resolvePath(cwd, options.baselinePath),
  };
}

async function resolveFromReview(
  options: PromoteVisualBaselineOptions,
  cwd: string,
): Promise<{ candidatePath: string; baselinePath: string }> {
  if (!options.reviewPath) {
    throw new Error("--from-review requires a failure-review.json path.");
  }
  const reviewPath = resolvePath(cwd, options.reviewPath);
  const reviewDir = path.dirname(reviewPath);
  const review = JSON.parse(await readFile(reviewPath, "utf-8")) as FailureReviewJson;
  const entries = review.failedElements ?? [];
  const selected =
    typeof options.failureIndex === "number"
      ? entries[options.failureIndex - 1]
      : entries.find((entry) => entry.visualEvidence?.baselineCandidatePath);
  if (!selected?.visualEvidence?.baselineCandidatePath || !selected.visualEvidence.baselinePath) {
    throw new Error(
      "No promotable baseline candidate found in failure-review.json for the requested failure index.",
    );
  }
  return {
    candidatePath: resolvePath(reviewDir, selected.visualEvidence.baselineCandidatePath),
    baselinePath: resolvePath(reviewDir, selected.visualEvidence.baselinePath),
  };
}

function requireValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function parseFailureIndex(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--failure-index must be a positive 1-based integer.");
  }
  return value;
}

function resolvePath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

async function assertReadableFile(filePath: string, label: string): Promise<void> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`${label} path is not a file: ${filePath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("path is not a file")) {
      throw error;
    }
    throw new Error(`Cannot read ${label} file: ${filePath}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}
