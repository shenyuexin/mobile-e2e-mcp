import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReactNativeLiveSuccessCandidate,
  renderReactNativeLiveSuccessCandidateMarkdown,
  validateReactNativeLiveSuccessCandidate,
} from "./react-native-live-success-candidate.ts";
import type { ReactNativeOneCommandResult } from "./react-native-one-command.ts";

function oneCommand(overrides: Partial<ReactNativeOneCommandResult> = {}): ReactNativeOneCommandResult {
  return {
    schema: "react-native-one-command/v2",
    runId: "rn-one-command",
    verdict: "blocked",
    proofLevel: "blocked_before_live",
    stages: [],
    liveBridge: {
      mode: "skipped",
      status: "skipped",
      detail: "Live bridge was not requested.",
    },
    blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No device." }],
    evidence: {
      readiness: "ready.json",
      evidencePack: "pack.json",
      result: "result.json",
    },
    nextAction: { kind: "fix_readiness_blocker", command: "pnpm run validate:react-native-readiness", reason: "Fix readiness." },
    boundaries: ["The live bridge is explicit and only runs after RN readiness passes."],
    ...overrides,
  };
}

test("RN live success candidate blocks skipped bridge output", () => {
  const candidate = buildReactNativeLiveSuccessCandidate({
    runId: "candidate-test",
    oneCommandResultPath: "result.json",
    oneCommand: oneCommand(),
  });

  assert.equal(candidate.verdict, "blocked_before_rn_live_success");
  assert.equal(candidate.successEvidencePromoted, false);
  assert.equal(candidate.blockers.some((blocker) => blocker.reasonCode === "RN_LIVE_BRIDGE_NOT_RUN"), true);
  assert.equal(candidate.nextAction.kind, "connect_device_and_run_rn_live_bridge");
  validateReactNativeLiveSuccessCandidate(candidate);
});

test("RN live success candidate promotes completed physical bridge with intake evidence", () => {
  const candidate = buildReactNativeLiveSuccessCandidate({
    runId: "candidate-test",
    oneCommandResultPath: "result.json",
    oneCommand: oneCommand({
      verdict: "completed",
      proofLevel: "physical_or_emulator_candidate",
      liveBridge: {
        mode: "live",
        status: "completed",
        proofLevel: "physical_or_emulator_candidate",
        outputDir: "output/rn-live",
        evidence: {
          verification: "output/rn-live/verification",
          intake: "output/rn-live/intake",
        },
        blockers: [],
        detail: "Mobile-change live bridge verdict: completed.",
      },
      blockers: [],
    }),
  });

  assert.equal(candidate.verdict, "rn_live_success_promoted");
  assert.equal(candidate.successEvidencePromoted, true);
  assert.equal(candidate.blockers.length, 0);
  assert.equal(candidate.nextAction.kind, "attach_rn_live_success_evidence");
  validateReactNativeLiveSuccessCandidate(candidate);
});

test("RN live success candidate keeps physical bridge pending when intake evidence is missing", () => {
  const candidate = buildReactNativeLiveSuccessCandidate({
    runId: "candidate-test",
    oneCommandResultPath: "result.json",
    oneCommand: oneCommand({
      verdict: "completed",
      proofLevel: "physical_or_emulator_candidate",
      liveBridge: {
        mode: "live",
        status: "completed",
        proofLevel: "physical_or_emulator_candidate",
        outputDir: "output/rn-live",
        evidence: {
          verification: "output/rn-live/verification",
        },
        blockers: [],
        detail: "Mobile-change live bridge verdict: completed.",
      },
      blockers: [],
    }),
  });

  assert.equal(candidate.verdict, "rn_live_success_pending_promotion");
  assert.equal(candidate.successEvidencePromoted, false);
  assert.equal(candidate.blockers[0]?.reasonCode, "RN_LIVE_INTAKE_EVIDENCE_MISSING");
});

test("RN live success candidate rejects non-completed bridge failures", () => {
  const candidate = buildReactNativeLiveSuccessCandidate({
    runId: "candidate-test",
    oneCommandResultPath: "result.json",
    oneCommand: oneCommand({
      verdict: "intake_rejected",
      proofLevel: "no_device_or_controlled_output",
      liveBridge: {
        mode: "live",
        status: "intake_rejected",
        proofLevel: "no_device_or_controlled_output",
        outputDir: "output/rn-live",
        blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No device." }],
        detail: "Mobile-change live bridge verdict: intake_rejected.",
      },
      blockers: [],
    }),
  });

  assert.equal(candidate.verdict, "not_promotable_rn_live_output");
  assert.equal(candidate.blockers.some((blocker) => blocker.reasonCode === "RN_LIVE_BRIDGE_NOT_COMPLETED"), true);
});

test("RN live success candidate markdown preserves blocked-output boundary", () => {
  const candidate = buildReactNativeLiveSuccessCandidate({
    runId: "candidate-test",
    oneCommandResultPath: "result.json",
    oneCommand: oneCommand(),
  });
  const markdown = renderReactNativeLiveSuccessCandidateMarkdown(candidate);

  assert.match(markdown, /React Native live success candidate/);
  assert.match(markdown, /Blocked RN output/);
});
