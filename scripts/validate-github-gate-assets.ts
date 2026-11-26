import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Validation for the reusable mobile-e2e-gate composite action and for local
 * Markdown link integrity across the root READMEs and all Markdown under docs.
 *
 * It intentionally uses a small, purpose-built YAML reader instead of adding a
 * runtime dependency: only the action.yml structure relevant to the gate
 * contract is inspected (inputs, runs.using, and step keys/block scalars).
 */

export const REQUIRED_INPUTS = [
  "mode",
  "platform",
  "app-id",
  "device-id",
  "flow-path",
  "baseline-path",
  "base-report-dir",
  "head-report-dir",
  "output-dir",
  "fail-on-regression",
  "upload-artifacts",
  "comment-pr",
  "package-version",
] as const;

export const SUPPORTED_MODES = ["audit", "explore", "run", "diff"] as const;

export interface GateStep {
  name: string;
  shell?: string;
  uses?: string;
  if?: string;
  id?: string;
  run: string;
  env: Record<string, string>;
  with: Record<string, string>;
}

export interface GateAction {
  using?: string;
  inputs: string[];
  steps: GateStep[];
}

export interface BrokenLink {
  file: string;
  link: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseActionYaml(source: string): GateAction {
  const inputs: string[] = [];
  const steps: GateStep[] = [];
  let section: "inputs" | "runs" | "" = "";
  let using: string | undefined;
  let currentStep: GateStep | undefined;
  let blockKey: "run" | "env" | "with" | "" = "";
  let blockIndent = 0;

  for (const raw of source.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const trimmed = raw.trim();

    if (blockKey && indent > blockIndent && currentStep) {
      if (blockKey === "run") {
        currentStep.run += trimmed + "\n";
      } else {
        const entry = trimmed.match(/^([\w-]+):\s*(.*)$/);
        if (entry) currentStep[blockKey][entry[1]] = unquote(entry[2]);
      }
      continue;
    }
    blockKey = "";

    if (indent === 0) {
      const top = trimmed.match(/^([\w-]+):/);
      if (top) {
        section = top[1] === "inputs" ? "inputs" : top[1] === "runs" ? "runs" : "";
        currentStep = undefined;
      }
      continue;
    }

    if (section === "inputs") {
      const input = trimmed.match(/^([\w-]+):/);
      if (input && indent === 2) inputs.push(input[1]);
      continue;
    }

    if (section !== "runs") continue;

    if (indent === 2 && /^using:/.test(trimmed)) {
      using = unquote(trimmed.slice("using:".length));
      continue;
    }
    const stepStart = trimmed.match(/^-\s+name:\s*(.*)$/);
    if (indent === 4 && stepStart) {
      currentStep = {
        name: unquote(stepStart[1]),
        env: {},
        with: {},
        run: "",
      };
      steps.push(currentStep);
      continue;
    }
    if (!currentStep) continue;

    const kv = trimmed.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2];
    if (key === "run" || key === "env" || key === "with") {
      blockKey = key;
      blockIndent = indent;
    } else if (key === "shell") {
      currentStep.shell = unquote(value);
    } else if (key === "uses") {
      currentStep.uses = unquote(value);
    } else if (key === "if") {
      currentStep.if = unquote(value);
    } else if (key === "id") {
      currentStep.id = unquote(value);
    }
  }

  return { using, inputs, steps };
}

export function validateActionYaml(source: string): string[] {
  const issues: string[] = [];
  const action = parseActionYaml(source);

  if (action.using !== "composite") {
    issues.push("runs.using must be 'composite'");
  }
  for (const input of REQUIRED_INPUTS) {
    if (!action.inputs.includes(input)) issues.push(`missing input '${input}'`);
  }

  const runSteps = action.steps.filter((step) => step.run.trim() !== "");
  if (runSteps.length === 0) issues.push("no run steps found");
  for (const step of runSteps) {
    if (step.shell !== "bash") {
      issues.push(`step '${step.name}' must use shell: bash`);
    }
    if (/\$\{\{[\s\S]*?\}\}/.test(step.run)) {
      issues.push(
        `step '${step.name}' interpolates an action expression into shell source; pass it through env instead`,
      );
    }
  }

  const shellSource = runSteps.map((step) => step.run).join("\n");
  if (!/audit\|explore\|run\|diff/.test(shellSource)) {
    issues.push("mode validation must allow audit|explore|run|diff");
  }
  for (const mode of SUPPORTED_MODES) {
    if (!new RegExp(`\\b${mode}\\)`).test(shellSource)) {
      issues.push(`missing gate branch for mode '${mode}'`);
    }
  }

  const upload = action.steps.find((step) => step.uses === "actions/upload-artifact@v4");
  if (!upload) {
    issues.push("artifact upload must use actions/upload-artifact@v4");
  } else if (!/upload-artifacts['"]?\]\s*==\s*'true'/.test(upload.if ?? "")) {
    issues.push("artifact upload must be gated on upload-artifacts == 'true'");
  }

  const comment = action.steps.find((step) => /gh pr comment/.test(step.run));
  if (!comment) {
    issues.push("PR comment step must call 'gh pr comment'");
  } else {
    if (!/comment-pr['"]?\]\s*==\s*'true'/.test(comment.if ?? "")) {
      issues.push("PR comment must be gated on comment-pr == 'true'");
    }
    if (!/pull_request/.test(comment.if ?? "")) {
      issues.push("PR comment must be limited to a pull_request context");
    }
  }

  return issues;
}

function listMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const name of ["README.md", "README.zh-CN.md"]) {
    const candidate = path.join(root, name);
    if (existsSync(candidate)) files.push(candidate);
  }
  const docsDir = path.join(root, "docs");
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  walk(docsDir);
  return files.sort();
}

export function checkMarkdownLinks(root: string, files?: string[]): BrokenLink[] {
  const broken: BrokenLink[] = [];
  const targets = files ?? listMarkdownFiles(root);
  const linkPattern = /(?:!?\[[^\]]*\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const file of targets) {
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(linkPattern)) {
      const href = match[1].trim();
      if (/^(https?:|mailto:|data:|#)/i.test(href)) continue;
      const localPath = href.split("#")[0];
      if (!localPath) continue;
      let decoded: string;
      try {
        decoded = decodeURIComponent(localPath);
      } catch {
        broken.push({ file, link: href });
        continue;
      }
      if (!existsSync(path.resolve(path.dirname(file), decoded))) {
        broken.push({ file, link: href });
      }
    }
  }
  return broken;
}

export function runValidation(root: string): string[] {
  const issues: string[] = [];
  const actionPath = path.join(root, ".github/actions/mobile-e2e-gate/action.yml");
  if (!existsSync(actionPath)) {
    issues.push(`missing ${path.relative(root, actionPath)}`);
  } else {
    issues.push(
      ...validateActionYaml(readFileSync(actionPath, "utf8")).map(
        (issue) => `action.yml: ${issue}`,
      ),
    );
  }
  for (const link of checkMarkdownLinks(root)) {
    issues.push(`broken link in ${path.relative(root, link.file)}: ${link.link}`);
  }
  return issues;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const issues = runValidation(root);
  if (issues.length === 0) {
    console.log("GitHub gate action and Markdown link validation passed.");
  } else {
    console.error("GitHub gate action / Markdown link validation failed:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
  }
}
