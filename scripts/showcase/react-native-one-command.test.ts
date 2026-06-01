import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReactNativeOneCommandArgs,
  runReactNativeOneCommand,
  renderReactNativeOneCommandMarkdown,
  validateReactNativeOneCommand,
} from "./react-native-one-command.ts";
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
  runtimeMode: "bare_debug",
  runtimeRequirements: {
    requiresMetroInspector: true,
    requiresJsDebugTarget: true,
    requiresAppArtifact: false,
    entryStrategy: "native_app_launch",
  },
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
  assert.equal(result.stages.map((stage) => stage.id).join(","), "readiness,evidence-pack,live-bridge,review");
  assert.equal(result.liveBridge.status, "skipped");
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

test("RN one-command can run live bridge after readiness passes", async () => {
  const result = await runReactNativeOneCommand("rn-one-command-live", {
    runReadiness: async () => ({ path: "ready.json", result: readyReadiness }),
    runEvidencePack: async () => ({ path: "pack.json", result: pack() }),
    runLiveBridge: async () => ({
      outputDir: "output/rn-live",
      result: {
        schema: "mobile-change-one-command/v1",
        runId: "mobile-live",
        mode: "live",
        verdict: "completed",
        proofLevel: "physical_or_emulator_candidate",
        stages: [],
        blockers: [],
        evidence: { verification: "output/rn-live/verification", intake: "output/rn-live/intake" },
        nextAction: { kind: "attach_live_evidence", command: "pnpm run verify:mobile-change -- --live", reason: "Attach live evidence." },
        boundaries: ["Live success evidence must pass intake before it is promoted as tracked showcase evidence."],
      },
    }),
  }, { enableLiveBridge: true });

  assert.equal(result.verdict, "completed");
  assert.equal(result.liveBridge.status, "completed");
  assert.equal(result.proofLevel, "physical_or_emulator_candidate");
  validateReactNativeOneCommand(result);
});

test("RN one-command skips requested live bridge when readiness is blocked", async () => {
  const blockedPack = pack({
    reviewStatus: "blocked",
    proofLevel: "blocked_before_live",
    readiness: {
      sourcePath: "ready.json",
      verdict: "blocked_before_react_native_verification",
      proofLevel: "blocked_before_live",
      blockers: [{ reasonCode: "DEVICE_UNAVAILABLE", detail: "No device." }],
    },
  });
  const result = await runReactNativeOneCommand("rn-one-command-live-skipped", {
    runReadiness: async () => ({
      path: "ready.json",
      result: { ...readyReadiness, verdict: "blocked_before_react_native_verification", proofLevel: "blocked_before_live" },
    }),
    runEvidencePack: async () => ({ path: "pack.json", result: blockedPack }),
  }, { enableLiveBridge: true });

  assert.equal(result.verdict, "blocked");
  assert.equal(result.liveBridge.status, "skipped");
  assert.match(result.liveBridge.detail, /readiness did not pass/);
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

test("RN one-command parser exposes live bridge CLI options", () => {
  const options = parseReactNativeOneCommandArgs([
    "--live-bridge",
    "--run-id=rn-cli",
    "--output-dir=output/rn-cli",
    "--bridge-run-id=rn-cli-bridge",
    "--bridge-output-dir=output/rn-cli/bridge",
    "--contract=configs/readiness/demo-android-app.android.json",
  ], false);

  assert.equal(options.enableLiveBridge, true);
  assert.equal(options.runId, "rn-cli");
  assert.equal(options.outputDir, "output/rn-cli");
  assert.equal(options.liveBridgeRunId, "rn-cli-bridge");
  assert.equal(options.liveBridgeOutputDir, "output/rn-cli/bridge");
  assert.equal(options.liveBridgeContractPath, "configs/readiness/demo-android-app.android.json");
});

test("RN one-command can point result evidence at a custom output path", async () => {
  const result = await runReactNativeOneCommand("rn-output-path", {
    runReadiness: async () => ({ path: "ready.json", result: readyReadiness }),
    runEvidencePack: async () => ({ path: "pack.json", result: pack() }),
  }, { resultPath: "output/rn-custom/result.json" });

  assert.equal(result.evidence.result, "output/rn-custom/result.json");
  validateReactNativeOneCommand(result);
});
