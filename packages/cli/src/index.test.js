import assert from "node:assert/strict";
import test from "node:test";

test("verify-mobile-change subcommand forwards to the one-command verifier", async () => {
  const { buildMobileChangeVerifyCommand } = await import("./index.js");

  const invocation = buildMobileChangeVerifyCommand("/repo", ["--live", "--run-id=abc"]);

  assert.equal(invocation.command, "pnpm");
  assert.deepEqual(invocation.args, [
    "--dir",
    "/repo",
    "exec",
    "tsx",
    "scripts/showcase/mobile-change-one-command.ts",
    "--live",
    "--run-id=abc",
  ]);
});
