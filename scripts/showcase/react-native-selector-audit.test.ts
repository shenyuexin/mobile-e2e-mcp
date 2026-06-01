import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildReactNativeSelectorAudit,
  renderReactNativeSelectorAuditMarkdown,
  scanReactNativeSelectorSource,
  scanReactNativeSelectors,
} from "./react-native-selector-audit.ts";

test("scans literal RN selector props from source", () => {
  const selectors = scanReactNativeSelectorSource({
    relativePath: "App.tsx",
    content: [
      '<TextInput testID="phone-input" />',
      "<TouchableOpacity accessibilityLabel='Submit login' />",
      '<Text accessibilityHint={"Go home"} />',
    ].join("\n"),
  });

  assert.deepEqual(selectors.map((item) => item.selector), ["phone-input", "Submit login", "Go home"]);
  assert.deepEqual(selectors.map((item) => item.prop), ["testID", "accessibilityLabel", "accessibilityHint"]);
  assert.equal(selectors[2]?.line, 3);
});

test("selector audit passes when declared selectors are found", () => {
  const result = buildReactNativeSelectorAudit({
    runId: "selector-audit-test",
    sourceRoots: ["app"],
    declaredSelectors: ["phone-input", "login-button"],
    discoveredSelectors: [
      { selector: "phone-input", prop: "testID", file: "app/App.tsx", line: 1 },
      { selector: "login-button", prop: "testID", file: "app/App.tsx", line: 2 },
    ],
  });

  assert.equal(result.verdict, "selector_contract_satisfied");
  assert.equal(result.blockers.length, 0);
  assert.equal(result.matches.length, 2);
});

test("selector audit blocks missing declared selectors", () => {
  const result = buildReactNativeSelectorAudit({
    runId: "selector-audit-test",
    sourceRoots: ["app"],
    declaredSelectors: ["phone-input", "missing-submit"],
    discoveredSelectors: [
      { selector: "phone-input", prop: "testID", file: "app/App.tsx", line: 1 },
    ],
  });

  assert.equal(result.verdict, "blocked_before_react_native_verification");
  assert.deepEqual(result.missingSelectors, ["missing-submit"]);
  assert.equal(result.blockers[0]?.reasonCode, "RN_SELECTOR_MISSING");
});

test("selector audit reports duplicate selector occurrences without failing by itself", () => {
  const result = buildReactNativeSelectorAudit({
    runId: "selector-audit-test",
    sourceRoots: ["app"],
    declaredSelectors: ["shared-button"],
    discoveredSelectors: [
      { selector: "shared-button", prop: "testID", file: "app/A.tsx", line: 1 },
      { selector: "shared-button", prop: "testID", file: "app/B.tsx", line: 2 },
    ],
  });

  assert.equal(result.verdict, "selector_contract_satisfied");
  assert.equal(result.duplicateSelectors[0]?.selector, "shared-button");
  assert.equal(result.duplicateSelectors[0]?.occurrences.length, 2);
});

test("scanner walks configured source roots and ignores non-source files", async () => {
  const dir = path.join(tmpdir(), `rn-selector-audit-${Date.now()}`);
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "src", "App.tsx"), '<View testID="root-view" />', "utf8");
  await writeFile(path.join(dir, "src", "notes.md"), '<View testID="ignored" />', "utf8");

  const selectors = await scanReactNativeSelectors([dir]);
  assert.equal(selectors.length, 1);
  assert.equal(selectors[0]?.selector, "root-view");
});

test("scanner includes repo-owned RN template fixtures", async () => {
  const dir = path.join(tmpdir(), `rn-selector-audit-template-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "App.tsx.template"), '<View testID="template-root" />', "utf8");

  const selectors = await scanReactNativeSelectors([dir]);
  assert.equal(selectors[0]?.selector, "template-root");
});

test("selector audit markdown preserves static-source boundary", () => {
  const result = buildReactNativeSelectorAudit({
    runId: "selector-audit-test",
    sourceRoots: ["app"],
    declaredSelectors: ["phone-input"],
    discoveredSelectors: [
      { selector: "phone-input", prop: "testID", file: "app/App.tsx", line: 1 },
    ],
  });

  const markdown = renderReactNativeSelectorAuditMarkdown(result);
  assert.match(markdown, /React Native selector audit/);
  assert.match(markdown, /static source evidence/);
});
