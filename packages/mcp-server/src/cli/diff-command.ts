import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { dirname, resolve } from "node:path";
import {
  computeRunDiff,
  formatDiffMarkdown,
  generateHtmlReport,
  type HtmlReportOptions,
  type RunComparison,
} from "@mobile-e2e-mcp/explorer";
import { requireCliFlagValue } from "./cli-args.js";

export interface DiffCommandOptions {
  baseDir?: string;
  headDir?: string;
  markdown?: string;
  html?: string;
  json: boolean;
  failOnRegression: boolean;
  help: boolean;
  error?: string;
}

export interface DiffCommandDependencies {
  computeRunDiff: (baseDir: string, headDir: string) => RunComparison | Promise<RunComparison>;
  formatDiffMarkdown: (comparison: RunComparison) => string;
  generateHtmlReport: (comparison: RunComparison, options?: HtmlReportOptions) => string;
  writeFile: (filePath: string, data: string) => void;
}

function printDiffHelp(): void {
  console.log(`Usage: mobile-e2e-mcp diff <baseDir> <headDir> [options]

Compare two Explorer run directories and render PR-ready reports.
Reads summary.json, failure-review.json, and optional audit*.json from each directory.

Options:
  --markdown <path>       Write the Markdown summary to this path
  --html <path>           Write the self-contained HTML report to this path
  --json                  Print the structured comparison as JSON
  --fail-on-regression    Exit non-zero when hasRegressions is true
  --help, -h              Show this help message`);
}

export function parseDiffArgs(argv: string[]): DiffCommandOptions {
  const options: DiffCommandOptions = {
    json: false,
    failOnRegression: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--fail-on-regression") {
      options.failOnRegression = true;
    } else if (arg === "--markdown") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.markdown = next;
      i += 1;
    } else if (arg === "--html") {
      const missing = requireCliFlagValue(arg, next);
      if (missing) {
        options.error = missing;
        return options;
      }
      options.html = next;
      i += 1;
    } else if (arg.startsWith("-")) {
      options.error = `Unknown option "${arg}". Run "mobile-e2e-mcp diff --help" for usage.`;
      return options;
    } else if (!options.baseDir) {
      options.baseDir = arg;
    } else if (!options.headDir) {
      options.headDir = arg;
    } else {
      options.error = `Unexpected argument "${arg}". Run "mobile-e2e-mcp diff --help" for usage.`;
      return options;
    }
  }

  return options;
}

const defaultDeps: DiffCommandDependencies = {
  computeRunDiff,
  formatDiffMarkdown,
  generateHtmlReport,
  writeFile: (filePath, data) => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, data, "utf-8");
  },
};

export async function executeDiff(
  argv: string[],
  deps: Partial<DiffCommandDependencies> = {},
  cwd: string = process.cwd(),
): Promise<number> {
  const resolvedDeps: DiffCommandDependencies = { ...defaultDeps, ...deps };
  const options = parseDiffArgs(argv);
  if (options.help) {
    printDiffHelp();
    return 0;
  }
  if (options.error) {
    console.error(options.error);
    return 2;
  }
  if (!options.baseDir || !options.headDir) {
    console.error("Usage: mobile-e2e-mcp diff <baseDir> <headDir> [--markdown <path>] [--html <path>] [--json] [--fail-on-regression]");
    return 2;
  }

  const baseDir = resolve(cwd, options.baseDir);
  const headDir = resolve(cwd, options.headDir);
  const comparison = await resolvedDeps.computeRunDiff(baseDir, headDir);
  const markdown = resolvedDeps.formatDiffMarkdown(comparison);
  const htmlPath = options.html ? resolve(cwd, options.html) : undefined;

  if (options.markdown) {
    const markdownPath = resolve(cwd, options.markdown);
    resolvedDeps.writeFile(markdownPath, markdown);
  }
  if (htmlPath) {
    const html = resolvedDeps.generateHtmlReport(comparison, {
      artifactDir: headDir,
      outputPath: htmlPath,
    });
    resolvedDeps.writeFile(htmlPath, html);
  }

  if (options.json) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    console.log(markdown);
  }

  return options.failOnRegression && comparison.hasRegressions ? 1 : 0;
}
