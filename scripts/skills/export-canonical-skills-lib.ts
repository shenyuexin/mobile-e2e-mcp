import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";

export type ExportMode = "copy" | "symlink";

export interface CanonicalSkill {
  name: string;
  description: string;
  directoryName: string;
  sourcePath: string;
}

export interface ExportCliOptions {
  outDir: string;
  mode: ExportMode;
  dryRun: boolean;
  check: boolean;
}

export type InstallTargetPreset = "opencode-config" | "opencode-home";

export interface ExportCanonicalSkillsOptions {
  repoRoot: string;
  outDir: string;
  mode: ExportMode;
  dryRun?: boolean;
  check?: boolean;
}

export interface ExportCanonicalSkillsResult {
  exportedCount: number;
  checkedCount: number;
  plannedCount: number;
  skills: string[];
}

function parseFrontmatter(markdown: string): { name: string; description: string } {
  const match = /^---\n([\s\S]*?)\n---/u.exec(markdown);
  if (!match) {
    throw new Error("Skill file is missing valid YAML frontmatter.");
  }

  const values = new Map<string, string>();
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value.replace(/^['"]|['"]$/gu, ""));
  }

  const name = values.get("name");
  const description = values.get("description");
  if (!name || !description) {
    throw new Error("Skill frontmatter must include name and description.");
  }
  return { name, description };
}

async function ensureCanonicalSourcePath(skillsRoot: string, sourcePath: string): Promise<void> {
  const rootReal = await realpath(skillsRoot);
  const sourceReal = await realpath(sourcePath);
  const normalizedRoot = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
  if (!sourceReal.startsWith(normalizedRoot)) {
    throw new Error(`Canonical skill source must live inside the canonical skills root: ${sourcePath}`);
  }
}

async function buildTargetContentState(targetPath: string): Promise<string | undefined> {
  try {
    return await readFile(targetPath, "utf8");
  } catch {
    return undefined;
  }
}

export function repoRootFromScript(scriptImportMetaUrl: string): string {
  const scriptPath = fileURLToPath(scriptImportMetaUrl);
  return path.resolve(path.dirname(scriptPath), "..", "..");
}

export function parseExportCliOptions(argv: string[]): ExportCliOptions {
  let outDir: string | undefined;
  let mode: ExportMode = "copy";
  let dryRun = false;
  let check = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg === "--out-dir") {
      outDir = argv[index + 1];
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

  if (!outDir) {
    throw new Error("--out-dir is required.");
  }

  return { outDir, mode, dryRun, check };
}

export function resolveInstallTargetPreset(preset: InstallTargetPreset): string {
  switch (preset) {
    case "opencode-config":
      return path.join(process.env.HOME ?? "", ".config", "opencode", "skills");
    case "opencode-home":
      return path.join(process.env.HOME ?? "", ".opencode", "skills");
    default:
      throw new Error(`Unknown install target preset: ${String(preset)}`);
  }
}

export async function discoverCanonicalSkills(repoRoot: string): Promise<CanonicalSkill[]> {
  const skillsRoot = path.join(repoRoot, "skills");
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const discovered: CanonicalSkill[] = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Canonical skill sources must live inside the canonical skills root: ${path.join(skillsRoot, entry.name)}`);
    }
    if (!entry.isDirectory()) {
      continue;
    }
    const sourcePath = path.join(skillsRoot, entry.name, "SKILL.md");
    const source = await readFile(sourcePath, "utf8");
    await ensureCanonicalSourcePath(skillsRoot, sourcePath);
    const { name, description } = parseFrontmatter(source);
    if (name !== entry.name) {
      throw new Error(`Skill directory name '${entry.name}' must match frontmatter name '${name}'.`);
    }
    discovered.push({ name, description, directoryName: entry.name, sourcePath });
  }

  return discovered.sort((left, right) => left.name.localeCompare(right.name));
}

export async function exportCanonicalSkills(options: ExportCanonicalSkillsOptions): Promise<ExportCanonicalSkillsResult> {
  const skills = await discoverCanonicalSkills(options.repoRoot);
  let exportedCount = 0;
  let checkedCount = 0;

  for (const skill of skills) {
    const targetDir = path.join(options.outDir, skill.directoryName);
    const targetPath = path.join(targetDir, "SKILL.md");
    const sourceContent = await readFile(skill.sourcePath, "utf8");
    const currentContent = await buildTargetContentState(targetPath);

    if (options.check) {
      checkedCount += 1;
      if (currentContent !== sourceContent) {
        throw new Error(`Canonical skill export is out of sync for ${skill.name}.`);
      }
      continue;
    }

    if (options.dryRun) {
      continue;
    }

    await mkdir(targetDir, { recursive: true });
    await rm(targetPath, { force: true });
    if (options.mode === "copy") {
      await writeFile(targetPath, sourceContent, "utf8");
    } else {
      const relativeSource = path.relative(targetDir, skill.sourcePath);
      await symlink(relativeSource, targetPath, "file");
    }
    exportedCount += 1;
  }

  return {
    exportedCount,
    checkedCount,
    plannedCount: skills.length,
    skills: skills.map((skill) => skill.name),
  };
}
