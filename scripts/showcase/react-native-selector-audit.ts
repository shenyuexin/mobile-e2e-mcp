import assert from "node:assert/strict";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ReactNativeSelectorAuditVerdict = "selector_contract_satisfied" | "blocked_before_react_native_verification";
export type ReactNativeSelectorAuditReasonCode = "OK" | "RN_SELECTOR_MISSING" | "RN_SELECTOR_DUPLICATE" | "RN_SELECTOR_SOURCE_UNAVAILABLE";

export interface ReactNativeSelectorOccurrence {
  selector: string;
  prop: "testID" | "accessibilityLabel" | "accessibilityHint";
  file: string;
  line: number;
}

export interface ReactNativeSelectorAuditResult {
  schema: "react-native-selector-audit/v1";
  runId: string;
  verdict: ReactNativeSelectorAuditVerdict;
  sourceRoots: string[];
  declaredSelectors: string[];
  discoveredSelectors: ReactNativeSelectorOccurrence[];
  matches: ReactNativeSelectorOccurrence[];
  missingSelectors: string[];
  duplicateSelectors: Array<{
    selector: string;
    occurrences: ReactNativeSelectorOccurrence[];
  }>;
  blockers: Array<{
    reasonCode: ReactNativeSelectorAuditReasonCode;
    detail: string;
    nextAction: string;
  }>;
  boundaries: string[];
}

const outputDir = "docs/showcase/evidence/react-native-selector-audit";
const auditJsonPath = `${outputDir}/audit.json`;
const auditMarkdownPath = `${outputDir}/audit.md`;
const selectorProps = ["testID", "accessibilityLabel", "accessibilityHint"] as const;
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignoredDirs = new Set(["node_modules", "android", "ios", "build", "dist", ".expo", ".git"]);

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function relativeToRepo(absolutePath: string): string {
  return path.relative(repoRoot(), absolutePath).split(path.sep).join("/");
}

function selectorRegex(): RegExp {
  return /\b(testID|accessibilityLabel|accessibilityHint)\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/g;
}

function isSupportedSourceFile(filePath: string): boolean {
  return sourceExtensions.has(path.extname(filePath)) || filePath.endsWith(".tsx.template") || filePath.endsWith(".jsx.template");
}

export function scanReactNativeSelectorSource(input: {
  relativePath: string;
  content: string;
}): ReactNativeSelectorOccurrence[] {
  const occurrences: ReactNativeSelectorOccurrence[] = [];
  const lines = input.content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const regex = selectorRegex();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const prop = match[1];
      const selector = match[2] ?? match[3] ?? match[4] ?? match[5];
      if (selectorProps.includes(prop as ReactNativeSelectorOccurrence["prop"]) && selector) {
        occurrences.push({
          selector,
          prop: prop as ReactNativeSelectorOccurrence["prop"],
          file: input.relativePath,
          line: index + 1,
        });
      }
    }
  }
  return occurrences;
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const absoluteRoot = path.isAbsolute(root) ? root : path.join(repoRoot(), root);
  const rootStat = await stat(absoluteRoot).catch(() => undefined);
  if (!rootStat) return [];
  if (rootStat.isFile()) return isSupportedSourceFile(absoluteRoot) ? [absoluteRoot] : [];

  const files: string[] = [];
  for (const entry of await readdir(absoluteRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...await collectSourceFiles(path.join(absoluteRoot, entry.name)));
      }
      continue;
    }
    if (entry.isFile() && isSupportedSourceFile(entry.name)) {
      files.push(path.join(absoluteRoot, entry.name));
    }
  }
  return files;
}

export async function scanReactNativeSelectors(sourceRoots: string[]): Promise<ReactNativeSelectorOccurrence[]> {
  const files = unique((await Promise.all(sourceRoots.map(collectSourceFiles))).flat()).sort();
  const scanned = await Promise.all(files.map(async (absolutePath) => scanReactNativeSelectorSource({
    relativePath: relativeToRepo(absolutePath),
    content: await readFile(absolutePath, "utf8"),
  })));
  return scanned.flat().sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.selector.localeCompare(b.selector));
}

function selectorAuditBoundaries(): string[] {
  return [
    "This audit is static source evidence; it does not prove the selector is visible at runtime.",
    "Only literal testID/accessibilityLabel/accessibilityHint values are counted in this phase.",
    "Device UI hierarchy confirmation still belongs to live verification and intake evidence.",
  ];
}

export function buildReactNativeSelectorAudit(input: {
  runId: string;
  sourceRoots: string[];
  declaredSelectors: string[];
  discoveredSelectors: ReactNativeSelectorOccurrence[];
}): ReactNativeSelectorAuditResult {
  const declaredSelectors = unique(input.declaredSelectors);
  const discoveredBySelector = new Map<string, ReactNativeSelectorOccurrence[]>();
  for (const occurrence of input.discoveredSelectors) {
    discoveredBySelector.set(occurrence.selector, [...(discoveredBySelector.get(occurrence.selector) ?? []), occurrence]);
  }

  const matches = declaredSelectors.flatMap((selector) => discoveredBySelector.get(selector) ?? []);
  const missingSelectors = declaredSelectors.filter((selector) => !discoveredBySelector.has(selector));
  const duplicateSelectors = [...discoveredBySelector.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([selector, occurrences]) => ({ selector, occurrences }));
  const blockers: ReactNativeSelectorAuditResult["blockers"] = [];

  if (input.discoveredSelectors.length === 0) {
    blockers.push({
      reasonCode: "RN_SELECTOR_SOURCE_UNAVAILABLE",
      detail: `No RN selector literals were found under ${input.sourceRoots.join(", ") || "no source roots"}.`,
      nextAction: "Point M2E_RN_SELECTOR_SOURCE_ROOTS at the RN app source or add literal testID/accessibility identifiers.",
    });
  }
  for (const selector of missingSelectors) {
    blockers.push({
      reasonCode: "RN_SELECTOR_MISSING",
      detail: `Declared selector was not found in RN source: ${selector}.`,
      nextAction: `Add a literal testID/accessibility identifier for ${selector} or remove it from M2E_RN_STABLE_SELECTORS.`,
    });
  }

  return {
    schema: "react-native-selector-audit/v1",
    runId: input.runId,
    verdict: blockers.length === 0 ? "selector_contract_satisfied" : "blocked_before_react_native_verification",
    sourceRoots: input.sourceRoots,
    declaredSelectors,
    discoveredSelectors: input.discoveredSelectors,
    matches,
    missingSelectors,
    duplicateSelectors,
    blockers,
    boundaries: selectorAuditBoundaries(),
  };
}

export function renderReactNativeSelectorAuditMarkdown(result: ReactNativeSelectorAuditResult): string {
  const matchLines = result.matches.length > 0
    ? result.matches.map((item) => `- ${item.selector}: \`${item.prop}\` in \`${item.file}:${item.line}\``)
    : ["- none"];
  const missingLines = result.missingSelectors.length > 0 ? result.missingSelectors.map((selector) => `- ${selector}`) : ["- none"];
  const duplicateLines = result.duplicateSelectors.length > 0
    ? result.duplicateSelectors.map((item) => `- ${item.selector}: ${item.occurrences.length} occurrences`)
    : ["- none"];
  const blockerLines = result.blockers.length > 0
    ? result.blockers.map((blocker) => `- ${blocker.reasonCode}: ${blocker.detail}`)
    : ["- none"];

  return [
    "## React Native selector audit",
    "",
    `Verdict: \`${result.verdict}\``,
    `Run ID: \`${result.runId}\``,
    `Source roots: ${result.sourceRoots.map((root) => `\`${root}\``).join(", ")}`,
    `Declared selectors: ${result.declaredSelectors.map((selector) => `\`${selector}\``).join(", ")}`,
    "",
    "Matches:",
    ...matchLines,
    "",
    "Missing selectors:",
    ...missingLines,
    "",
    "Duplicate selectors:",
    ...duplicateLines,
    "",
    "Blockers:",
    ...blockerLines,
    "",
    "Boundaries:",
    ...result.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
}

export function validateReactNativeSelectorAudit(result: ReactNativeSelectorAuditResult): void {
  assert.equal(result.schema, "react-native-selector-audit/v1");
  assert.ok(result.sourceRoots.length > 0, "selector audit requires at least one source root");
  assert.ok(result.declaredSelectors.length > 0, "selector audit requires declared selectors");
  assert.ok(result.boundaries.some((boundary) => boundary.includes("static source evidence")), "selector audit must keep static-source boundary");
  if (result.verdict === "selector_contract_satisfied") {
    assert.equal(result.missingSelectors.length, 0, "satisfied selector audit cannot include missing selectors");
    assert.equal(result.blockers.length, 0, "satisfied selector audit cannot include blockers");
  } else {
    assert.ok(result.blockers.length > 0, "blocked selector audit must include blockers");
  }
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-selector-audit`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : fallback;
}

export async function writeReactNativeSelectorAudit(check: boolean): Promise<ReactNativeSelectorAuditResult> {
  const sourceRoots = envList("M2E_RN_SELECTOR_SOURCE_ROOTS", ["docs/showcase/fixtures/react-native-login"]);
  const declaredSelectors = envList("M2E_RN_STABLE_SELECTORS", ["login-screen", "phone-input", "password-input", "login-button"]);
  const result = buildReactNativeSelectorAudit({
    runId: process.env.M2E_RN_SELECTOR_AUDIT_RUN_ID ?? "react-native-selector-audit-2026-06-01",
    sourceRoots,
    declaredSelectors,
    discoveredSelectors: await scanReactNativeSelectors(sourceRoots),
  });
  validateReactNativeSelectorAudit(result);
  await writeOrCheck(auditJsonPath, `${JSON.stringify(result, null, 2)}\n`, check);
  await writeOrCheck(auditMarkdownPath, renderReactNativeSelectorAuditMarkdown(result), check);
  return result;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const result = await writeReactNativeSelectorAudit(check);
  console.log(check ? "React Native selector audit is up to date." : `React Native selector audit written to ${outputDir}`);
  console.log(JSON.stringify({
    verdict: result.verdict,
    missingSelectors: result.missingSelectors,
    discoveredSelectorCount: result.discoveredSelectors.length,
  }, null, 2));
  if (result.verdict !== "selector_contract_satisfied" && process.env.M2E_RN_SELECTOR_AUDIT_ALLOW_BLOCKED !== "1") {
    process.exitCode = 1;
  }
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
