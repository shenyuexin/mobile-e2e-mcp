import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ReactNativeFailureTaxonomyVerdict = "rn_failure_detected" | "no_rn_failure_detected";
export type ReactNativeFailureReasonCode =
  | "RN_METRO_UNAVAILABLE"
  | "RN_NO_DEBUG_TARGET"
  | "RN_JS_EXCEPTION"
  | "RN_BUNDLE_LOAD_FAILED"
  | "RN_NETWORK_FAILURE"
  | "RN_RED_BOX_VISIBLE"
  | "RN_SELECTOR_MISSING"
  | "RN_NATIVE_MODULE_ERROR";
export type ReactNativeFailureCategory = "environment" | "rn_runtime" | "network" | "selector_contract";
export type ReactNativeFailureConfidence = "high" | "medium" | "low";

export interface ReactNativeFailureRecommendation {
  kind:
    | "start_metro_or_expo"
    | "attach_react_native_debug_target"
    | "inspect_js_exception"
    | "inspect_network_failure"
    | "repair_selector_contract"
    | "inspect_red_box"
    | "collect_native_module_evidence";
  command: string;
  reason: string;
  bounded: true;
}

export interface ReactNativeFailureClassification {
  reasonCode: ReactNativeFailureReasonCode;
  category: ReactNativeFailureCategory;
  confidence: ReactNativeFailureConfidence;
  detail: string;
  evidence: string[];
  recommendation: ReactNativeFailureRecommendation;
}

export interface ReactNativeFailureTaxonomy {
  schema: "react-native-failure-taxonomy/v1";
  runId: string;
  verdict: ReactNativeFailureTaxonomyVerdict;
  classifications: ReactNativeFailureClassification[];
  boundaries: string[];
}

export interface ReactNativeFailureTaxonomyInput {
  runId: string;
  readinessBlockers: Array<{ reasonCode: string; detail: string }>;
  consoleSignal?: {
    status?: string;
    summary?: string;
    counters?: Record<string, number>;
  };
  networkSignal?: {
    status?: string;
    summary?: string;
    counters?: Record<string, number>;
  };
}

const outputDir = "docs/showcase/evidence/react-native-failure-taxonomy";
const taxonomyJsonPath = `${outputDir}/taxonomy.json`;
const taxonomyMarkdownPath = `${outputDir}/taxonomy.md`;
const evidencePackPath = "docs/showcase/evidence/react-native-evidence-pack/evidence-pack.json";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function taxonomyBoundaries(): string[] {
  return [
    "RN failure taxonomy groups observed evidence; it is not a root-cause oracle.",
    "Recommendations are bounded next actions and must not autonomously edit app or test code.",
    "Metro-only or JS-only evidence cannot promote live success without native verification and intake.",
  ];
}

function recommendationFor(reasonCode: ReactNativeFailureReasonCode): ReactNativeFailureRecommendation {
  switch (reasonCode) {
    case "RN_METRO_UNAVAILABLE":
      return { kind: "start_metro_or_expo", command: "npx react-native start", reason: "Metro must be reachable before RN debug evidence can be collected.", bounded: true };
    case "RN_NO_DEBUG_TARGET":
      return { kind: "attach_react_native_debug_target", command: "pnpm run validate:react-native-readiness", reason: "Launch or reload the RN app so Metro exposes a debuggable JS target.", bounded: true };
    case "RN_JS_EXCEPTION":
    case "RN_BUNDLE_LOAD_FAILED":
      return { kind: "inspect_js_exception", command: "pnpm run validate:react-native-evidence-pack", reason: "Inspect Metro console evidence before retrying verification.", bounded: true };
    case "RN_NETWORK_FAILURE":
      return { kind: "inspect_network_failure", command: "pnpm run validate:react-native-evidence-pack", reason: "Review failed RN network requests and compare them with app network policy evidence.", bounded: true };
    case "RN_RED_BOX_VISIBLE":
      return { kind: "inspect_red_box", command: "pnpm run verify:react-native-change", reason: "Capture UI and JS evidence around the red box before retrying actions.", bounded: true };
    case "RN_SELECTOR_MISSING":
      return { kind: "repair_selector_contract", command: "pnpm run validate:react-native-selector-audit", reason: "Repair the RN testID/accessibility selector contract before live verification.", bounded: true };
    case "RN_NATIVE_MODULE_ERROR":
      return { kind: "collect_native_module_evidence", command: "pnpm run validate:react-native-evidence-pack", reason: "Collect JS and native evidence before assigning native-module cause.", bounded: true };
  }
}

function classification(input: {
  reasonCode: ReactNativeFailureReasonCode;
  category: ReactNativeFailureCategory;
  confidence: ReactNativeFailureConfidence;
  detail: string;
  evidence: string[];
}): ReactNativeFailureClassification {
  return { ...input, recommendation: recommendationFor(input.reasonCode) };
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function classifyReactNativeFailure(input: ReactNativeFailureTaxonomyInput): ReactNativeFailureTaxonomy {
  const classifications: ReactNativeFailureClassification[] = [];
  for (const blocker of input.readinessBlockers) {
    if (blocker.reasonCode === "METRO_UNAVAILABLE") {
      classifications.push(classification({ reasonCode: "RN_METRO_UNAVAILABLE", category: "environment", confidence: "high", detail: blocker.detail, evidence: [`readiness:${blocker.reasonCode}`] }));
    } else if (blocker.reasonCode === "NO_JS_DEBUG_TARGET") {
      classifications.push(classification({ reasonCode: "RN_NO_DEBUG_TARGET", category: "environment", confidence: "high", detail: blocker.detail, evidence: [`readiness:${blocker.reasonCode}`] }));
    } else if (blocker.reasonCode === "STABLE_SELECTOR_CONTRACT_MISSING" || blocker.reasonCode === "RN_SELECTOR_MISSING") {
      classifications.push(classification({ reasonCode: "RN_SELECTOR_MISSING", category: "selector_contract", confidence: "high", detail: blocker.detail, evidence: [`readiness:${blocker.reasonCode}`] }));
    }
  }

  const consoleSummary = input.consoleSignal?.summary ?? "";
  const exceptionCount = input.consoleSignal?.counters?.exceptionCount ?? 0;
  if (exceptionCount > 0) {
    classifications.push(classification({ reasonCode: "RN_JS_EXCEPTION", category: "rn_runtime", confidence: "medium", detail: `Metro console reported ${exceptionCount} JS exception(s).`, evidence: [`console.exceptionCount:${exceptionCount}`] }));
  }
  if (includesAny(consoleSummary, [/bundle/i, /unable to load script/i, /scripturl/i])) {
    classifications.push(classification({ reasonCode: "RN_BUNDLE_LOAD_FAILED", category: "rn_runtime", confidence: "medium", detail: "Metro console summary suggests a bundle load failure.", evidence: [`console.summary:${consoleSummary}`] }));
  }
  if (includesAny(consoleSummary, [/red box/i, /redbox/i])) {
    classifications.push(classification({ reasonCode: "RN_RED_BOX_VISIBLE", category: "rn_runtime", confidence: "medium", detail: "Console summary references a React Native red box.", evidence: [`console.summary:${consoleSummary}`] }));
  }
  if (includesAny(consoleSummary, [/native module/i, /NativeModule/])) {
    classifications.push(classification({ reasonCode: "RN_NATIVE_MODULE_ERROR", category: "rn_runtime", confidence: "medium", detail: "Console summary references a native module error.", evidence: [`console.summary:${consoleSummary}`] }));
  }

  const failedRequestCount = input.networkSignal?.counters?.failedRequestCount ?? 0;
  if (failedRequestCount > 0) {
    classifications.push(classification({ reasonCode: "RN_NETWORK_FAILURE", category: "network", confidence: "medium", detail: `Metro network evidence reported ${failedRequestCount} failed request(s).`, evidence: [`network.failedRequestCount:${failedRequestCount}`] }));
  }

  return {
    schema: "react-native-failure-taxonomy/v1",
    runId: input.runId,
    verdict: classifications.length > 0 ? "rn_failure_detected" : "no_rn_failure_detected",
    classifications,
    boundaries: taxonomyBoundaries(),
  };
}

export function renderReactNativeFailureTaxonomyMarkdown(taxonomy: ReactNativeFailureTaxonomy): string {
  const classificationLines = taxonomy.classifications.length > 0
    ? taxonomy.classifications.flatMap((item) => [
        `- ${item.reasonCode}: \`${item.category}\`, confidence \`${item.confidence}\``,
        `  - Detail: ${item.detail}`,
        `  - Recommendation: \`${item.recommendation.kind}\` - ${item.recommendation.reason}`,
        `  - Command: \`${item.recommendation.command}\``,
      ])
    : ["- none"];

  return [
    "## React Native failure taxonomy",
    "",
    `Verdict: \`${taxonomy.verdict}\``,
    `Run ID: \`${taxonomy.runId}\``,
    "",
    "Classifications:",
    ...classificationLines,
    "",
    "Boundaries:",
    ...taxonomy.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
}

export function validateReactNativeFailureTaxonomy(taxonomy: ReactNativeFailureTaxonomy): void {
  assert.equal(taxonomy.schema, "react-native-failure-taxonomy/v1");
  assert.ok(taxonomy.boundaries.some((boundary) => boundary.includes("not a root-cause oracle")), "taxonomy must keep diagnosis boundary");
  if (taxonomy.verdict === "rn_failure_detected") {
    assert.ok(taxonomy.classifications.length > 0, "failure verdict requires classifications");
  } else {
    assert.equal(taxonomy.classifications.length, 0, "clean verdict cannot include classifications");
  }
  for (const item of taxonomy.classifications) {
    assert.equal(item.recommendation.bounded, true, "RN remediation recommendations must be bounded");
    assert.ok(item.evidence.length > 0, "RN classifications require evidence anchors");
  }
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repoRoot(), relativePath), "utf8")) as T;
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-failure-taxonomy`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeReactNativeFailureTaxonomy(check: boolean): Promise<ReactNativeFailureTaxonomy> {
  const pack = await readJson<{
    readiness?: { blockers?: Array<{ reasonCode: string; detail: string }> };
    jsSignals?: {
      console?: ReactNativeFailureTaxonomyInput["consoleSignal"];
      network?: ReactNativeFailureTaxonomyInput["networkSignal"];
    };
  }>(evidencePackPath);
  const taxonomy = classifyReactNativeFailure({
    runId: process.env.M2E_RN_FAILURE_TAXONOMY_RUN_ID ?? "react-native-failure-taxonomy-2026-06-01",
    readinessBlockers: pack.readiness?.blockers ?? [],
    consoleSignal: pack.jsSignals?.console,
    networkSignal: pack.jsSignals?.network,
  });
  validateReactNativeFailureTaxonomy(taxonomy);
  await writeOrCheck(taxonomyJsonPath, `${JSON.stringify(taxonomy, null, 2)}\n`, check);
  await writeOrCheck(taxonomyMarkdownPath, renderReactNativeFailureTaxonomyMarkdown(taxonomy), check);
  return taxonomy;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const taxonomy = await writeReactNativeFailureTaxonomy(check);
  console.log(check ? "React Native failure taxonomy is up to date." : `React Native failure taxonomy written to ${outputDir}`);
  console.log(JSON.stringify({
    verdict: taxonomy.verdict,
    classifications: taxonomy.classifications.map((item) => item.reasonCode),
  }, null, 2));
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
