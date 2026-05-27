import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("mobile handoff generator module can be imported without writing or logging", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "await import('./scripts/showcase/generate-mobile-change-handoff.ts')",
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

test("mobile handoff summary includes verification verdict and failure excerpt", async () => {
  const { buildMobileChangeHandoffSummary, renderMobileChangeHandoffMarkdown } = await import("./generate-mobile-change-handoff.ts");

  const summary = buildMobileChangeHandoffSummary({
    verification: {
      schema: "mobile-change-verification/v1",
      runId: "handoff-fixture",
      source: "live_device",
      verdict: "mobile_change_verification_failed",
      validationSurface: {
        platform: "android",
        appId: "com.example.mobilechange",
        policyProfile: "interactive",
      },
      readiness: {
        expectedScreenId: "login",
        expectedAppPhase: "authentication",
        matched: false,
      },
      workflow: {
        stepIds: ["launch-app", "check-readiness"],
      },
      evidence: {
        artifacts: [
          { kind: "summary", path: "docs/showcase/evidence/mobile-change-readiness-failure/summary.json" },
          { kind: "failure_packet", path: "docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json" },
        ],
      },
      nextAction: {
        kind: "inspect_failure_packet",
        command: "pnpm run validate:mobile-change-readiness-failure",
        reason: "Inspect the generated failure packet before retrying.",
      },
      boundaries: ["Controlled proof, not physical-device fidelity."],
    },
    failurePacket: {
      schema: "mobile-verification-failure-packet/v1",
      runId: "handoff-fixture",
      source: "live_device",
      category: "app_readiness",
      confidence: "high",
      failedStep: {
        id: "check-readiness",
        tool: "get_screen_summary",
        status: "failed",
        reasonCode: "APP_NOT_READY",
      },
      reasonCode: "APP_NOT_READY",
      evidence: {
        artifacts: [
          { kind: "failure_packet", path: "docs/showcase/evidence/mobile-change-readiness-failure/failure-packet.json" },
        ],
        signals: { appNotReady: true },
      },
      nextAction: {
        kind: "wait_or_fix_readiness_contract",
        reason: "Add or verify deterministic readiness signals.",
      },
      boundaries: ["Does not autonomously fix app code."],
    },
  });

  assert.equal(summary.schema, "mobile-change-handoff/v1");
  assert.equal(summary.verdict, "mobile_change_verification_failed");
  assert.equal(summary.failure?.category, "app_readiness");
  assert.equal(summary.nextCommand, "pnpm run validate:mobile-change-readiness-failure");
  assert.ok(summary.artifacts.some((artifact) => artifact.kind === "failure_packet"));

  const markdown = renderMobileChangeHandoffMarkdown(summary);
  assert.match(markdown, /## Mobile change handoff/);
  assert.match(markdown, /Verdict: `mobile_change_verification_failed`/);
  assert.match(markdown, /Failure excerpt:/);
  assert.match(markdown, /Category: `app_readiness`/);
  assert.match(markdown, /Next command:/);
});
