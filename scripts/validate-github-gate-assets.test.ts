import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkMarkdownLinks,
  parseActionYaml,
  REQUIRED_INPUTS,
  runValidation,
  validateActionYaml,
} from "./validate-github-gate-assets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const actionPath = path.join(root, ".github/actions/mobile-e2e-gate/action.yml");
const actionSource = (): string => readFileSync(actionPath, "utf8");

test("mobile-e2e-gate declares every required input and a composite bash action", () => {
  const action = parseActionYaml(actionSource());
  assert.equal(action.using, "composite");
  for (const input of REQUIRED_INPUTS) {
    assert.ok(action.inputs.includes(input), `missing input: ${input}`);
  }
  assert.ok(action.steps.length >= 4);
  for (const step of action.steps.filter((candidate) => candidate.run.trim() !== "")) {
    assert.equal(step.shell, "bash", `step '${step.name}' must use shell: bash`);
  }
  assert.deepEqual(validateActionYaml(actionSource()), []);
});

test("gate branches cover audit/explore/run/diff and never interpolate inputs into shell", () => {
  const action = parseActionYaml(actionSource());
  const shellSource = action.steps.map((step) => step.run).join("\n");
  for (const mode of ["audit", "explore", "run", "diff"]) {
    assert.match(shellSource, new RegExp(`\\b${mode}\\)`));
  }
  assert.doesNotMatch(shellSource, /\$\{\{/);
  const envValues = Object.values(action.steps.flatMap((step) => Object.values(step.env)));
  assert.ok(
    envValues.some((value) => value.includes("inputs.mode")),
    "mode must be supplied through an env var",
  );
});

test("upload uses actions/upload-artifact@v4 and PR comment is PR-context gated", () => {
  const action = parseActionYaml(actionSource());
  const upload = action.steps.find((step) => step.uses === "actions/upload-artifact@v4");
  assert.ok(upload, "expected actions/upload-artifact@v4");
  assert.match(upload?.if ?? "", /upload-artifacts.*true/);

  const comment = action.steps.find((step) => /gh pr comment/.test(step.run));
  assert.ok(comment, "expected gh pr comment step");
  assert.match(comment?.if ?? "", /comment-pr.*true/);
  assert.match(comment?.if ?? "", /pull_request/);
});

test("validator rejects raw action-expression interpolation in a synthetic run step", () => {
  const unsafe = [
    "runs:",
    "  using: composite",
    "  steps:",
    "    - name: Unsafe",
    "      shell: bash",
    "      run: |",
    '        echo "${{ inputs.mode }}"',
    "",
  ].join("\n");
  const issues = validateActionYaml(unsafe);
  assert.ok(
    issues.some((issue) => /interpolates an action expression into shell source/.test(issue)),
    `expected interpolation issue, got: ${issues.join("; ")}`,
  );
});

test("markdown links across root READMEs and docs resolve", () => {
  assert.deepEqual(checkMarkdownLinks(root), []);
  assert.deepEqual(runValidation(root), []);
});

test("link checker detects a synthetic broken relative link", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "m2e-link-check-"));
  try {
    const file = path.join(dir, "broken.md");
    writeFileSync(file, "See [missing](./does-not-exist.md) and [ok](https://example.com)\n", "utf8");
    assert.deepEqual(checkMarkdownLinks(root, [file]), [
      { file, link: "./does-not-exist.md" },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
