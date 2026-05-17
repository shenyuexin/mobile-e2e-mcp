import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parsePromoteVisualBaselineArgs,
  promoteVisualBaseline,
} from "./promote-visual-baseline-lib.js";

test("parsePromoteVisualBaselineArgs supports review mode", () => {
  assert.deepEqual(
    parsePromoteVisualBaselineArgs([
      "--from-review",
      "failure-review.json",
      "--failure-index",
      "2",
      "--dry-run",
    ]),
    {
      reviewPath: "failure-review.json",
      failureIndex: 2,
      dryRun: true,
    },
  );
});

test("promoteVisualBaseline copies a candidate from failure-review metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "promote-visual-baseline-"));
  const runDir = path.join(root, "run");
  const candidatePath = path.join(
    runDir,
    "visual-evidence",
    "baseline-candidates",
    "app",
    "screen",
    "button.png",
  );
  const baselinePath = path.join(root, "baselines", "app", "screen", "button.png");
  await mkdir(path.dirname(candidatePath), { recursive: true });
  await writeFile(candidatePath, "candidate-png");
  await writeFile(
    path.join(runDir, "failure-review.json"),
    JSON.stringify({
      failedElements: [
        {
          visualEvidence: {
            baselineCandidatePath:
              "visual-evidence/baseline-candidates/app/screen/button.png",
            baselinePath: "../baselines/app/screen/button.png",
          },
        },
      ],
    }),
  );

  const result = await promoteVisualBaseline({
    reviewPath: path.join(runDir, "failure-review.json"),
    cwd: root,
  });

  assert.equal(result.promoted, true);
  assert.equal(result.overwritten, false);
  assert.equal(result.candidatePath, candidatePath);
  assert.equal(result.baselinePath, baselinePath);
  assert.equal(await readFile(baselinePath, "utf-8"), "candidate-png");
});

test("promoteVisualBaseline refuses to overwrite without force", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "promote-visual-baseline-overwrite-"));
  const candidatePath = path.join(root, "candidate.png");
  const baselinePath = path.join(root, "baseline.png");
  await writeFile(candidatePath, "candidate");
  await writeFile(baselinePath, "existing");

  await assert.rejects(
    () =>
      promoteVisualBaseline({
        candidatePath,
        baselinePath,
        cwd: root,
      }),
    /Baseline already exists/,
  );
  assert.equal(await readFile(baselinePath, "utf-8"), "existing");
});

test("promoteVisualBaseline dry-run does not copy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "promote-visual-baseline-dry-run-"));
  const candidatePath = path.join(root, "candidate.png");
  const baselinePath = path.join(root, "baseline.png");
  await writeFile(candidatePath, "candidate");

  const result = await promoteVisualBaseline({
    candidatePath,
    baselinePath,
    dryRun: true,
    cwd: root,
  });

  assert.equal(result.promoted, false);
  assert.equal(result.dryRun, true);
  await assert.rejects(() => readFile(baselinePath, "utf-8"));
});
