import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import {
  discoverCanonicalSkills,
  exportCanonicalSkills,
  parseExportCliOptions,
} from "./export-canonical-skills-lib.ts";

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-skills-"));
  await mkdir(path.join(repoRoot, "skills"), { recursive: true });
  return repoRoot;
}

async function writeSkill(repoRoot: string, name: string, description = "Use when testing canonical skills") {
  const dir = path.join(repoRoot, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
}

test("discoverCanonicalSkills only returns skills/*/SKILL.md entries", async () => {
  const repoRoot = await createTempRepo();
  await writeSkill(repoRoot, "alpha-skill");
  await writeFile(path.join(repoRoot, "skills", "README.md"), "# Skills\n", "utf8");

  const discovered = await discoverCanonicalSkills(repoRoot);

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.name, "alpha-skill");
  assert.equal(discovered[0]?.sourcePath, path.join(repoRoot, "skills", "alpha-skill", "SKILL.md"));
});

test("discoverCanonicalSkills rejects malformed canonical skill frontmatter", async () => {
  const repoRoot = await createTempRepo();
  const dir = path.join(repoRoot, "skills", "broken-skill");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), "# broken\n", "utf8");

  await assert.rejects(() => discoverCanonicalSkills(repoRoot), /missing valid YAML frontmatter/i);
});

test("parseExportCliOptions requires an explicit out-dir", async () => {
  assert.throws(() => parseExportCliOptions([]), /--out-dir is required/i);
});

test("exportCanonicalSkills copy mode preserves skill-name/SKILL.md layout", async () => {
  const repoRoot = await createTempRepo();
  const outDir = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-skills-out-"));
  await writeSkill(repoRoot, "alpha-skill");

  const result = await exportCanonicalSkills({ repoRoot, outDir, mode: "copy" });
  const exportedPath = path.join(outDir, "alpha-skill", "SKILL.md");
  const exported = await readFile(exportedPath, "utf8");

  assert.equal(result.exportedCount, 1);
  assert.match(exported, /name: alpha-skill/);
});

test("exportCanonicalSkills symlink mode creates skill-name/SKILL.md symlink", async () => {
  const repoRoot = await createTempRepo();
  const outDir = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-skills-link-"));
  await writeSkill(repoRoot, "beta-skill");

  await exportCanonicalSkills({ repoRoot, outDir, mode: "symlink" });

  const exportedPath = path.join(outDir, "beta-skill", "SKILL.md");
  const linkedContent = await readFile(exportedPath, "utf8");
  assert.match(linkedContent, /name: beta-skill/);
});

test("exportCanonicalSkills check mode fails when destination drifts", async () => {
  const repoRoot = await createTempRepo();
  const outDir = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-skills-check-"));
  await writeSkill(repoRoot, "gamma-skill");
  await exportCanonicalSkills({ repoRoot, outDir, mode: "copy" });

  await writeFile(path.join(outDir, "gamma-skill", "SKILL.md"), "tampered\n", "utf8");

  await assert.rejects(
    () => exportCanonicalSkills({ repoRoot, outDir, mode: "copy", check: true }),
    /out of sync/i,
  );
});

test("exportCanonicalSkills rejects non-canonical symlinked source entries", async () => {
  const repoRoot = await createTempRepo();
  const actualRoot = await mkdtemp(path.join(os.tmpdir(), "mobile-e2e-skill-actual-"));
  await mkdir(path.join(actualRoot, "foreign-skill"), { recursive: true });
  await writeFile(
    path.join(actualRoot, "foreign-skill", "SKILL.md"),
    "---\nname: foreign-skill\ndescription: Use when foreign\n---\n",
    "utf8",
  );
  await symlink(
    path.join(actualRoot, "foreign-skill"),
    path.join(repoRoot, "skills", "foreign-skill"),
    "dir",
  );

  await assert.rejects(() => discoverCanonicalSkills(repoRoot), /must live inside the canonical skills root/i);
});
