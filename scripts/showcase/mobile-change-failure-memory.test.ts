import assert from "node:assert/strict";
import test from "node:test";

test("failure memory groups repeated readiness failures into readiness-contract remediation", async () => {
  const { buildMobileChangeFailureMemory, validateMobileChangeFailureMemory } = await import("./mobile-change-failure-memory.ts");

  const memory = buildMobileChangeFailureMemory({
    runId: "failure-memory-readiness",
    records: [
      {
        sourcePath: "run-a/failure-packet.json",
        category: "app_readiness",
        reasonCode: "APP_NOT_READY",
        confidence: "high",
        evidencePaths: ["run-a/inspect-ui.xml"],
      },
      {
        sourcePath: "run-b/failure-packet.json",
        category: "app_readiness",
        reasonCode: "APP_NOT_READY",
        confidence: "high",
        evidencePaths: ["run-b/inspect-ui.xml"],
      },
    ],
  });

  assert.equal(memory.schema, "mobile-change-failure-memory/v1");
  assert.equal(memory.patterns[0]?.category, "app_readiness");
  assert.equal(memory.patterns[0]?.occurrences, 2);
  assert.equal(memory.patterns[0]?.recommendation.kind, "repair_readiness_contract");
  assert.match(memory.patterns[0]?.recommendation.command ?? "", /validate:mobile-change-readiness-contract/);
  assert.equal(validateMobileChangeFailureMemory(memory).ok, true);
});

test("failure memory routes environment, network, selector, policy, and weak evidence separately", async () => {
  const { buildMobileChangeFailureMemory } = await import("./mobile-change-failure-memory.ts");

  const memory = buildMobileChangeFailureMemory({
    runId: "failure-memory-mixed",
    records: [
      { sourcePath: "device/candidate.json", category: "environment", reasonCode: "DEVICE_UNAVAILABLE", confidence: "high", evidencePaths: [] },
      { sourcePath: "network/failure-packet.json", category: "network", reasonCode: "NETWORK_POLICY_BLOCKED", confidence: "high", evidencePaths: ["network/logs.json"] },
      { sourcePath: "selector/failure-packet.json", category: "ui_target", reasonCode: "SELECTOR_NO_MATCH", confidence: "medium", evidencePaths: ["selector/ui.xml"] },
      { sourcePath: "policy/failure-packet.json", category: "policy", reasonCode: "POLICY_DENIED", confidence: "high", evidencePaths: ["policy/timeline.json"] },
      { sourcePath: "unknown/failure-packet.json", category: "unknown", reasonCode: "UNKNOWN", confidence: "low", evidencePaths: [] },
    ],
  });

  const kinds = memory.patterns.map((pattern) => pattern.recommendation.kind);
  assert.deepEqual(kinds, [
    "run_device_readiness_doctor",
    "inspect_network_policy",
    "refine_selector_or_wait",
    "request_policy_escalation",
    "collect_debug_evidence",
  ]);
  assert.equal(memory.patterns.at(-1)?.confidence, "low");
});

test("failure memory validator rejects high-confidence recommendations without evidence", async () => {
  const { buildMobileChangeFailureMemory, validateMobileChangeFailureMemory } = await import("./mobile-change-failure-memory.ts");

  const memory = buildMobileChangeFailureMemory({
    runId: "failure-memory-invalid",
    records: [
      { sourcePath: "network/failure-packet.json", category: "network", reasonCode: "NETWORK_POLICY_BLOCKED", confidence: "high", evidencePaths: ["network/logs.json"] },
    ],
  });

  assert.throws(
    () => validateMobileChangeFailureMemory({
      ...memory,
      patterns: [{
        ...memory.patterns[0]!,
        evidencePaths: [],
      }],
    }),
    /high-confidence patterns require evidence paths/,
  );
});
