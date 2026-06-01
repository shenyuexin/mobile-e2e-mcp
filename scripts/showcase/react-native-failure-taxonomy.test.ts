import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyReactNativeFailure,
  renderReactNativeFailureTaxonomyMarkdown,
  validateReactNativeFailureTaxonomy,
} from "./react-native-failure-taxonomy.ts";

test("classifies Metro and JS target readiness blockers", () => {
  const taxonomy = classifyReactNativeFailure({
    runId: "rn-taxonomy-test",
    readinessBlockers: [
      { reasonCode: "METRO_UNAVAILABLE", detail: "Metro down." },
      { reasonCode: "NO_JS_DEBUG_TARGET", detail: "No target." },
    ],
  });

  assert.deepEqual(taxonomy.classifications.map((item) => item.reasonCode), [
    "RN_METRO_UNAVAILABLE",
    "RN_NO_DEBUG_TARGET",
  ]);
  validateReactNativeFailureTaxonomy(taxonomy);
});

test("classifies missing selector contract", () => {
  const taxonomy = classifyReactNativeFailure({
    runId: "rn-taxonomy-test",
    readinessBlockers: [{ reasonCode: "STABLE_SELECTOR_CONTRACT_MISSING", detail: "Selectors missing." }],
  });

  assert.equal(taxonomy.classifications[0]?.reasonCode, "RN_SELECTOR_MISSING");
  assert.equal(taxonomy.classifications[0]?.recommendation.kind, "repair_selector_contract");
});

test("classifies JS exception and bundle failure signals", () => {
  const taxonomy = classifyReactNativeFailure({
    runId: "rn-taxonomy-test",
    readinessBlockers: [],
    consoleSignal: {
      status: "captured",
      summary: "Unable to load script from bundle URL",
      counters: { totalLogs: 2, exceptionCount: 1 },
    },
  });

  assert.equal(taxonomy.classifications.some((item) => item.reasonCode === "RN_JS_EXCEPTION"), true);
  assert.equal(taxonomy.classifications.some((item) => item.reasonCode === "RN_BUNDLE_LOAD_FAILED"), true);
});

test("classifies network failure signals", () => {
  const taxonomy = classifyReactNativeFailure({
    runId: "rn-taxonomy-test",
    readinessBlockers: [],
    networkSignal: {
      status: "captured",
      summary: "One failed request",
      counters: { totalTrackedRequests: 3, failedRequestCount: 1 },
    },
  });

  assert.equal(taxonomy.classifications[0]?.reasonCode, "RN_NETWORK_FAILURE");
  assert.equal(taxonomy.classifications[0]?.recommendation.kind, "inspect_network_failure");
});

test("clean evidence remains non-blocking", () => {
  const taxonomy = classifyReactNativeFailure({
    runId: "rn-taxonomy-test",
    readinessBlockers: [],
    consoleSignal: { status: "captured", summary: "clean", counters: { exceptionCount: 0 } },
    networkSignal: { status: "captured", summary: "clean", counters: { failedRequestCount: 0 } },
  });

  assert.equal(taxonomy.verdict, "no_rn_failure_detected");
  assert.equal(taxonomy.classifications.length, 0);
});

test("taxonomy markdown preserves bounded remediation boundary", () => {
  const taxonomy = classifyReactNativeFailure({
    runId: "rn-taxonomy-test",
    readinessBlockers: [{ reasonCode: "METRO_UNAVAILABLE", detail: "Metro down." }],
  });
  const markdown = renderReactNativeFailureTaxonomyMarkdown(taxonomy);

  assert.match(markdown, /React Native failure taxonomy/);
  assert.match(markdown, /must not autonomously edit/);
});
