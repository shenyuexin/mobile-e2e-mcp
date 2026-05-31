import assert from "node:assert/strict";
import test from "node:test";
import { runReactNativeOneCommand, renderReactNativeOneCommandMarkdown, validateReactNativeOneCommand } from "./react-native-one-command.ts";
import type { ReactNativeEvidencePack } from "./react-native-evidence-pack.ts";
import type { ReactNativeReadinessResult } from "./react-native-readiness.ts";

const readyReadiness: ReactNativeReadinessResult = {
  schema: "react-native-readiness/v1",
  runId: "ready",
  verdict: "ready_for_react_native_verification",
  proofLevel: "readiness_candidate",
  platform: "android",
  appId: "com.example.rn",
  metroBaseUrl: "http://127.0.0.1:8081",
  policyProfile: "interactive",
  runnerProfile: "react_native_android",
  selectedDeviceId: "device-1",
  expectedReadiness: { screenId: "login" },
  stableSelectors: ["login.submit"],
  checks: [],
  blockers: [],
  nextAction: { kind: "run_react_native_verification", command: "pnpm run verify:react-native-change", reason: "Ready." },
  boundaries: ["RN readiness is a preflight and does not prove app success by itself."],
};

function pack(overrides: Partial<ReactNativeEvidencePack> = {}): ReactNativeEvidencePack {
  return {
    schema: "react-native-evidence-pack/v1",
    runId: "pack",
    reviewStatus: "ready_for_review",
    proofLevel: "rn_evidence_candidate",
    readiness: { sourcePath: "ready.json", verdict: "ready_for_react_native_verification", proofLevel: "readiness_candidate", blockers: [] },
    jsSignals: {
      console: { available: true, source: "metro_inspector", status: "captured", summary: "clean", counters: { totalLogs: 0, exceptionCount: 0 } },
      network: { available: true, source: "metro_inspector", status: "captured", summary: "clean", counters: { totalTrackedRequests: 0, failedRequestCount: 0 } },
    },
    nativeEvidence: [{ kind: "readiness", path: "ready.json", status: "available", summary: "Ready." }],
    failureSummary: { strongestSuspectLayer: "unknown", confidence: "low", detail: "No issue." },
    nextAction: { kind: "attach_rn_evidence_pack", command: "pnpm run validate:react-native-evidence-pack", reason: "Attach evidence." },
    boundaries: ["Metro console and network signals are supplemental."],
    ...overrides,
  };
}

test("RN one-command completes when readiness and evidence pack are ready for review", async () => {
  const result = await runReactNativeOneCommand("rn-one-command-ready", {
    runReadiness: async () => ({ path: "ready.json", result: readyReadiness }),
    runEvidencePack: async () => ({ path: "pack.json", result: pack() }),
  });

  assert.equal(result.verdict, "completed");
  assert.equal(result.proofLevel, "rn_evidence_candidate");
  assert.equal(result.stages.map((stage) => stage.id).join(","), "readiness,evidence-pack,review");
  validateReactNativeOneCommand(result);
});

test("RN one-command preserves blocked readiness and next action", async () => {
  const blockedPack = pack({
    reviewStatus: "blocked",
    proofLevel: "blocked_before_live",
    readiness: {
      sourcePath: "ready.json",
      verdict: "blocked_before_react_native_verification",
      proofLevel: "blocked_before_live",
      blockers: [{ reasonCode: "METRO_UNAVAILABLE", detail: "Metro down." }],
    },
    nextAction: { kind: "fix_readiness_blocker", command: "npx react-native start", reason: "Start Metro." },
  });
  const result = await runReactNativeOneCommand("rn-one-command-blocked", {
    runReadiness: async () => ({
      path: "ready.json",
      result: { ...readyReadiness, verdict: "blocked_before_react_native_verification", proofLevel: "blocked_before_live" },
    }),
    runEvidencePack: async () => ({ path: "pack.json", result: blockedPack }),
  });

  assert.equal(result.verdict, "blocked");
  assert.equal(result.proofLevel, "blocked_before_live");
  assert.deepEqual(result.blockers.map((blocker) => blocker.reasonCode), ["METRO_UNAVAILABLE"]);
  assert.equal(result.nextAction.kind, "fix_readiness_blocker");
});

test("RN one-command returns needs review for JS runtime evidence concerns", async () => {
  const result = await runReactNativeOneCommand("rn-one-command-review", {
    runReadiness: async () => ({ path: "ready.json", result: readyReadiness }),
    runEvidencePack: async () => ({
      path: "pack.json",
      result: pack({
        reviewStatus: "needs_review",
        nextAction: { kind: "inspect_js_runtime", command: "pnpm run validate:react-native-evidence-pack", reason: "Inspect JS evidence." },
      }),
    }),
  });

  assert.equal(result.verdict, "needs_review");
  assert.equal(result.nextAction.kind, "inspect_js_runtime");
});

test("RN one-command markdown includes proof boundary language", async () => {
  const result = await runReactNativeOneCommand("rn-one-command-md", {
    runReadiness: async () => ({ path: "ready.json", result: readyReadiness }),
    runEvidencePack: async () => ({ path: "pack.json", result: pack() }),
  });
  const markdown = renderReactNativeOneCommandMarkdown(result);

  assert.match(markdown, /React Native one-command verification/);
  assert.match(markdown, /does not weaken proof-level labels/);
});
