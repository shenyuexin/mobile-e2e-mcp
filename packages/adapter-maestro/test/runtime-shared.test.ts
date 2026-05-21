import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { executeRunner } from "../src/runtime-shared.ts";

test("executeRunner timeout terminates child process groups", async () => {
  const startedAt = Date.now();
  const result = await executeRunner(
    ["/bin/sh", "-c", "sleep 30 & wait"],
    tmpdir(),
    process.env,
    { timeoutMs: 100 },
  );

  assert.equal(result.exitCode, null);
  assert.match(result.stderr, /Command timed out after 100ms/);
  assert.ok(Date.now() - startedAt < 5000, "timeout should not wait for descendant sleep process");
});
