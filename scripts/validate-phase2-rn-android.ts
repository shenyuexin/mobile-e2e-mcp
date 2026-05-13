import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function requireFile(repoRoot: string, relativePath: string): void {
  assert.equal(existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
}

function main(): void {
  const repoRoot = repoRootFromScript();

  const requiredFiles = [
    "scripts/dev/run-rn-android-acceptance.sh",
    "flows/samples/react-native/android-login-smoke.yaml",
  ];

  for (const file of requiredFiles) {
    requireFile(repoRoot, file);
  }

  const packageJson = readFileSync(path.join(repoRoot, "package.json"), "utf8");
  assert.equal(packageJson.includes('"validate:phase2-rn-android-acceptance"'), true);

  const runnerScript = readFileSync(path.join(repoRoot, "scripts/dev/run-rn-android-acceptance.sh"), "utf8");
  assert.equal(runnerScript.includes("EXPO_PROJECT_ROOT"), true);
  assert.equal(runnerScript.includes("Set EXPO_PROJECT_ROOT to a local Expo React Native sample"), true);

  const showcaseReadme = readFileSync(path.join(repoRoot, "docs/showcase/README.md"), "utf8");
  assert.equal(showcaseReadme.includes('validate:phase2-rn-android-acceptance'), true);

  const flow = readFileSync(path.join(repoRoot, "flows/samples/react-native/android-login-smoke.yaml"), "utf8");
  assert.equal(flow.includes('appId: com.anonymous.rnlogindemo'), true);

  console.log("Phase 2 RN Android prerequisite validation passed.");
}

main();
