import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("probe CI gate runs dry-run contracts without device dependencies", async () => {
  const { stdout } = await execFileAsync(
    "pnpm",
    ["run", "validate:probe-dry-run"],
    { cwd: repoRoot },
  );

  assert.match(stdout, /Android tool probe dry-run contract passed\./);
  assert.match(stdout, /iOS simulator tool probe dry-run contract passed\./);
  assert.match(stdout, /Probe dry-run CI gate validation passed\./);
});
