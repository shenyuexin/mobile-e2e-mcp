import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("generator module can be imported without writing or logging", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "await import('./scripts/showcase/generate-governed-pr-evidence-summary.ts')",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("rendered PR comment keeps the compact review sections stable", async () => {
  const { buildGovernedPrEvidenceSummary, renderPrComment } = await import("./generate-governed-pr-evidence-summary.ts");
  const summary = buildGovernedPrEvidenceSummary({
    positioning: {
      primaryWedge: "AI-safe mobile device control via MCP",
      currentVerdict: "practical_for_agent_governed_observation_and_action_mediation",
      notClaiming: ["does not replace Appium"],
    },
    evidenceCards: [
      { id: "settings-live-governed-control", verdict: "live_governed_control_observed" },
      { id: "policy-escalation-dry-run", verdict: "policy_escalation_retry_dry_run_observed" },
    ],
    recommendedCommands: [
      { command: "pnpm run quickstart:governed-control" },
      { command: "pnpm run validate:governed-evidence-brief" },
      { command: "pnpm run validate:governed-pr-evidence-summary" },
    ],
    remainingProofGaps: [
      { gap: "live policy escalation after denial" },
    ],
  });

  assert.deepEqual(summary.evidenceCardIds, ["settings-live-governed-control", "policy-escalation-dry-run"]);
  assert.deepEqual(summary.commands, [
    "pnpm run quickstart:governed-control",
    "pnpm run validate:governed-evidence-brief",
    "pnpm run validate:governed-pr-evidence-summary",
  ]);

  const markdown = renderPrComment(summary);
  assert.match(markdown, /## Governed mobile control evidence/);
  assert.match(markdown, /Validation commands:/);
  assert.match(markdown, /Boundaries:/);
  assert.match(markdown, /Next proof gaps:/);
  assert.match(markdown, /policy_escalation_retry_dry_run_observed/);
});
