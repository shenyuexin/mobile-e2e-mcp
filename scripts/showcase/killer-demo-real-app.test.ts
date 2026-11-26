import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  checkShowcaseDoc,
  formatPlanSummary,
  SHOWCASE_DOC_PATH,
  SHOWCASE_PLAN,
} from "./killer-demo-real-app.js";

test("showcase plan stays a reproducible-demo with two 60s real-app demos", () => {
  assert.equal(SHOWCASE_PLAN.proofLevel, "reproducible-demo");
  assert.equal(SHOWCASE_PLAN.liveProofClaimed, false);
  assert.equal(SHOWCASE_PLAN.deviceRequired, true);
  assert.equal(SHOWCASE_PLAN.demos.length, 2);
  for (const demo of SHOWCASE_PLAN.demos) {
    assert.equal(demo.budgetSeconds, 60);
    assert.match(demo.appId, /^org\./);
  }
  assert.deepEqual(
    SHOWCASE_PLAN.demos.map((demo) => demo.id),
    ["zero-script-ui-inspection", "agent-closed-loop"],
  );
});

test("committed showcase doc still satisfies its dry-run contract", () => {
  assert.ok(existsSync(SHOWCASE_DOC_PATH));
  assert.deepEqual(checkShowcaseDoc(readFileSync(SHOWCASE_DOC_PATH, "utf8")), []);
  assert.match(formatPlanSummary(), /live proof claimed: false/);
});

test("dry-run contract rejects a doc that overclaims live proof", () => {
  const doc = [
    "# Killer Demo",
    "Proof level: `reproducible-demo`",
    "`zero-script-ui-inspection` `org.wikipedia`",
    "`agent-closed-loop` `org.joinmastodon.android`",
    "explore --export-flows audit --baseline-path --fail-on-regression diff report.html",
    "--toolset core run --record-on-failure --suggest-heal audit_ui_surface explain_last_failure suggest_known_remediation --fail-on-regression",
  ].join("\n");
  const issues = checkShowcaseDoc(doc);
  assert.ok(issues.some((issue) => /not live proof/.test(issue)));
});

test("dry-run contract reports missing demo command tokens", () => {
  const issues = checkShowcaseDoc(
    [
      "Proof level: `reproducible-demo` and not live proof",
      "`zero-script-ui-inspection` `org.wikipedia`",
      "`agent-closed-loop` `org.joinmastodon.android`",
    ].join("\n"),
  );
  assert.ok(issues.some((issue) => /--record-on-failure/.test(issue)));
  assert.ok(issues.some((issue) => /--export-flows/.test(issue)));
});
