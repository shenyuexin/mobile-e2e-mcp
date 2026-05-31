import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface MobileChangeReadinessContract {
  schema: "mobile-change-readiness-contract/v1";
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  runnerProfile: string;
  policyProfile: string;
  deterministicEntry: {
    kind: "launch_app" | "deep_link";
    value?: string;
  };
  reset: {
    kind: "none" | "clear_app_data" | "custom_command";
    command?: string;
  };
  readiness: {
    proofLevel: "deterministic" | "visual_only";
    screenId?: string;
    appPhase?: string;
    selector?: {
      strategy: "accessibility_id" | "test_id" | "resource_id";
      value: string;
    };
    visualHint?: string;
  };
  boundaries: string[];
}

export interface MobileChangeReadinessContractValidation {
  strongProofReady: boolean;
  warnings: string[];
}

const defaultContractPath = "configs/readiness/mobile-change.android.json";

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function hasDeterministicReadinessSignal(contract: MobileChangeReadinessContract): boolean {
  return Boolean(contract.readiness.screenId || contract.readiness.appPhase || contract.readiness.selector?.value);
}

export function buildMobileChangeReadinessContract(input: {
  platform: "android" | "ios";
  appId: string;
  appArtifact?: string;
  runnerProfile: string;
  policyProfile: string;
  deterministicEntry?: MobileChangeReadinessContract["deterministicEntry"];
  reset?: MobileChangeReadinessContract["reset"];
  readiness: {
    screenId?: string;
    appPhase?: string;
    selector?: MobileChangeReadinessContract["readiness"]["selector"];
    visualHint?: string;
    proofLevel?: MobileChangeReadinessContract["readiness"]["proofLevel"];
  };
}): MobileChangeReadinessContract {
  return {
    schema: "mobile-change-readiness-contract/v1",
    platform: input.platform,
    appId: input.appId,
    appArtifact: input.appArtifact,
    runnerProfile: input.runnerProfile,
    policyProfile: input.policyProfile,
    deterministicEntry: input.deterministicEntry ?? { kind: "launch_app" },
    reset: input.reset ?? { kind: "none" },
    readiness: {
      proofLevel: input.readiness.proofLevel ?? "deterministic",
      screenId: input.readiness.screenId,
      appPhase: input.readiness.appPhase,
      selector: input.readiness.selector,
      visualHint: input.readiness.visualHint,
    },
    boundaries: [
      "This contract defines app-under-test readiness assumptions before live verification.",
      "Deterministic readiness signals are required for strong proof promotion.",
      "Visual-only readiness can guide inspection but cannot be promoted as strong live success evidence by itself.",
    ],
  };
}

export function validateMobileChangeReadinessContract(contract: MobileChangeReadinessContract): MobileChangeReadinessContractValidation {
  assert.equal(contract.schema, "mobile-change-readiness-contract/v1");
  assert.ok(contract.platform === "android" || contract.platform === "ios", "platform must be android or ios");
  assert.ok(contract.appId.length > 0, "appId must be provided");
  assert.ok(contract.runnerProfile.length > 0, "runnerProfile must be provided");
  assert.ok(contract.policyProfile.length > 0, "policyProfile must be provided");
  assert.ok(contract.deterministicEntry?.kind, "deterministic entry must be provided");
  assert.ok(contract.reset?.kind, "reset semantics must be provided");

  const warnings: string[] = [];
  if (contract.readiness.proofLevel === "visual_only") {
    warnings.push("visual_only_readiness_cannot_promote_strong_proof");
    assert.ok(contract.readiness.visualHint, "visual-only readiness requires visualHint");
    return { strongProofReady: false, warnings };
  }

  assert.ok(hasDeterministicReadinessSignal(contract), "deterministic readiness requires screenId, appPhase, or selector");
  return { strongProofReady: true, warnings };
}

export async function readMobileChangeReadinessContract(relativePath: string): Promise<MobileChangeReadinessContract> {
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(repoRoot(), relativePath);
  const contract = JSON.parse(await readFile(absolutePath, "utf8")) as MobileChangeReadinessContract;
  validateMobileChangeReadinessContract(contract);
  return contract;
}

async function writeOrCheck(relativePath: string, content: string, check: boolean): Promise<void> {
  const absolutePath = path.join(repoRoot(), relativePath);
  if (check) {
    assert.equal(await readFile(absolutePath, "utf8"), content, `${relativePath} is out of date; rerun pnpm run generate:mobile-change-readiness-contract`);
    return;
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export async function writeDefaultMobileChangeReadinessContract(check: boolean): Promise<MobileChangeReadinessContract> {
  const contract = buildMobileChangeReadinessContract({
    platform: "android",
    appId: "com.example.mobilechange",
    runnerProfile: "native_android",
    policyProfile: "interactive",
    readiness: {
      screenId: "login",
      appPhase: "authentication",
      selector: {
        strategy: "test_id",
        value: "login-screen",
      },
    },
  });
  validateMobileChangeReadinessContract(contract);
  await writeOrCheck(defaultContractPath, `${JSON.stringify(contract, null, 2)}\n`, check);
  return contract;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const contractPathArg = process.argv.find((arg) => arg.startsWith("--contract="));
  if (contractPathArg) {
    const contractPath = contractPathArg.slice("--contract=".length);
    const contract = await readMobileChangeReadinessContract(contractPath);
    const validation = validateMobileChangeReadinessContract(contract);
    console.log(JSON.stringify({ contractPath, strongProofReady: validation.strongProofReady, warnings: validation.warnings }, null, 2));
    return;
  }
  const contract = await writeDefaultMobileChangeReadinessContract(check);
  const validation = validateMobileChangeReadinessContract(contract);
  console.log(check
    ? "Mobile change readiness contract is up to date."
    : `Mobile change readiness contract written to ${defaultContractPath}`);
  console.log(JSON.stringify({
    appId: contract.appId,
    platform: contract.platform,
    strongProofReady: validation.strongProofReady,
    warnings: validation.warnings,
  }, null, 2));
}

function isCliEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
