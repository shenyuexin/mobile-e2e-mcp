import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ReactNativeRuntimeMode = "expo_go" | "expo_dev_client" | "bare_debug" | "bare_release";
export type ReactNativeRuntimeSupportLevel = "experimental" | "conditional";

export interface ReactNativeRuntimeModeContractEntry {
  mode: ReactNativeRuntimeMode;
  supportLevel: ReactNativeRuntimeSupportLevel;
  requiresMetroInspector: boolean;
  requiresJsDebugTarget: boolean;
  requiresAppArtifact: boolean;
  entryStrategy: "expo_url" | "dev_client_deep_link" | "native_app_launch" | "release_artifact_launch";
  proofBackbone: "native_ui_postcondition";
  supplementalEvidence: string[];
  caveats: string[];
  nextActions: string[];
}

export interface ReactNativeRuntimeContract {
  schema: "react-native-runtime-contract/v1";
  runId: string;
  defaultMode: ReactNativeRuntimeMode;
  modes: ReactNativeRuntimeModeContractEntry[];
  boundaries: string[];
}

const outputDir = "docs/showcase/evidence/react-native-runtime-contract";
const contractJsonPath = `${outputDir}/contract.json`;
const contractMarkdownPath = `${outputDir}/contract.md`;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function buildReactNativeRuntimeContract(runId: string): ReactNativeRuntimeContract {
  return {
    schema: "react-native-runtime-contract/v1",
    runId,
    defaultMode: "bare_debug",
    modes: [
      {
        mode: "expo_go",
        supportLevel: "conditional",
        requiresMetroInspector: true,
        requiresJsDebugTarget: true,
        requiresAppArtifact: false,
        entryStrategy: "expo_url",
        proofBackbone: "native_ui_postcondition",
        supplementalEvidence: ["Metro console snapshot", "Metro network snapshot"],
        caveats: [
          "Requires Expo Go or a compatible Expo runtime already available on the device.",
          "Native module behavior may differ from dev-client or bare builds.",
        ],
        nextActions: ["Start Expo with an inspectable Metro endpoint.", "Launch the Expo URL and wait for a JS debug target."],
      },
      {
        mode: "expo_dev_client",
        supportLevel: "experimental",
        requiresMetroInspector: true,
        requiresJsDebugTarget: true,
        requiresAppArtifact: false,
        entryStrategy: "dev_client_deep_link",
        proofBackbone: "native_ui_postcondition",
        supplementalEvidence: ["Metro console snapshot", "Metro network snapshot", "native logs"],
        caveats: [
          "Requires a dev-client build installed before verification.",
          "Deep-link entry must be deterministic and documented by the app-under-test contract.",
        ],
        nextActions: ["Install or select the dev-client app.", "Start Metro and launch the dev-client deep link."],
      },
      {
        mode: "bare_debug",
        supportLevel: "experimental",
        requiresMetroInspector: true,
        requiresJsDebugTarget: true,
        requiresAppArtifact: false,
        entryStrategy: "native_app_launch",
        proofBackbone: "native_ui_postcondition",
        supplementalEvidence: ["Metro console snapshot", "Metro network snapshot", "native logs", "screenshots"],
        caveats: [
          "Requires a debug-capable RN app and reachable Metro inspector.",
          "Metro evidence remains supplemental and cannot promote success without native post-condition proof.",
        ],
        nextActions: ["Install or launch the debug RN app.", "Start Metro and attach the JS debug target."],
      },
      {
        mode: "bare_release",
        supportLevel: "conditional",
        requiresMetroInspector: false,
        requiresJsDebugTarget: false,
        requiresAppArtifact: true,
        entryStrategy: "release_artifact_launch",
        proofBackbone: "native_ui_postcondition",
        supplementalEvidence: ["native logs", "screenshots", "crash evidence"],
        caveats: [
          "Release mode should not be blocked by missing Metro inspector or JS debug target.",
          "JS runtime diagnosis is limited without source-map or Hermes symbolication evidence.",
        ],
        nextActions: ["Provide a release APK/IPA artifact.", "Use native UI post-conditions and crash/log evidence for proof."],
      },
    ],
    boundaries: [
      "Runtime mode clarifies prerequisites; it does not start Metro, build apps, or install artifacts by itself.",
      "Native UI post-condition evidence remains the proof backbone for every RN mode.",
      "Metro and JS debug target evidence are required only for debug/dev modes and remain supplemental.",
    ],
  };
}

export function findReactNativeRuntimeMode(contract: ReactNativeRuntimeContract, mode: ReactNativeRuntimeMode): ReactNativeRuntimeModeContractEntry {
  const entry = contract.modes.find((candidate) => candidate.mode === mode);
  if (!entry) throw new Error(`Unsupported React Native runtime mode: ${mode}`);
  return entry;
}

export function defaultReactNativeRuntimeContract(): ReactNativeRuntimeContract {
  return buildReactNativeRuntimeContract("react-native-runtime-contract-2026-06-01");
}

export function renderReactNativeRuntimeContractMarkdown(contract: ReactNativeRuntimeContract): string {
  const modeLines = contract.modes.flatMap((entry) => [
    `- ${entry.mode}: \`${entry.supportLevel}\``,
    `  - Entry: \`${entry.entryStrategy}\``,
    `  - Requires Metro: \`${entry.requiresMetroInspector}\`; JS target: \`${entry.requiresJsDebugTarget}\`; app artifact: \`${entry.requiresAppArtifact}\``,
    `  - Evidence: ${entry.supplementalEvidence.map((item) => `\`${item}\``).join(", ")}`,
  ]);

  return [
    "## React Native runtime contract",
    "",
    `Run ID: \`${contract.runId}\``,
    `Default mode: \`${contract.defaultMode}\``,
    "",
    "Modes:",
    ...modeLines,
    "",
    "Boundaries:",
    ...contract.boundaries.map((boundary) => `- ${boundary}`),
    "",
  ].join("\n");
}

export function validateReactNativeRuntimeContract(contract: ReactNativeRuntimeContract): void {
  assert.equal(contract.schema, "react-native-runtime-contract/v1");
  assert.equal(contract.modes.length, 4, "runtime contract must cover the four first-class RN modes");
  const modes = new Set(contract.modes.map((entry) => entry.mode));
  for (const mode of ["expo_go", "expo_dev_client", "bare_debug", "bare_release"] as const) {
    assert.equal(modes.has(mode), true, `runtime contract missing ${mode}`);
  }
  const release = findReactNativeRuntimeMode(contract, "bare_release");
  assert.equal(release.requiresMetroInspector, false, "bare release must not require Metro");
  assert.equal(release.requiresJsDebugTarget, false, "bare release must not require JS debug target");
  assert.equal(release.requiresAppArtifact, true, "bare release must require an app artifact");
  assert.ok(contract.boundaries.some((boundary) => boundary.includes("does not start Metro")), "contract must keep non-mutating boundary");
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:react-native-runtime-contract`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeReactNativeRuntimeContract(check: boolean): Promise<ReactNativeRuntimeContract> {
  const contract = buildReactNativeRuntimeContract(process.env.M2E_RN_RUNTIME_CONTRACT_RUN_ID ?? "react-native-runtime-contract-2026-06-01");
  validateReactNativeRuntimeContract(contract);
  await writeOrCheck(contractJsonPath, `${JSON.stringify(contract, null, 2)}\n`, check);
  await writeOrCheck(contractMarkdownPath, renderReactNativeRuntimeContractMarkdown(contract), check);
  return contract;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const contract = await writeReactNativeRuntimeContract(check);
  console.log(check ? "React Native runtime contract is up to date." : `React Native runtime contract written to ${outputDir}`);
  console.log(JSON.stringify({
    schema: contract.schema,
    defaultMode: contract.defaultMode,
    modes: contract.modes.map((entry) => entry.mode),
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
