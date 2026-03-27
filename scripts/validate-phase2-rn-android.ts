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
    "examples/rn-login-demo/package.json",
    "examples/rn-login-demo/app.json",
    "examples/rn-login-demo/App.tsx",
    "examples/rn-login-demo/index.ts",
    "examples/rn-login-demo/tsconfig.json",
    "scripts/dev/run-phase2-rn-android.sh",
    "flows/samples/react-native/android-login-smoke.yaml",
  ];

  for (const file of requiredFiles) {
    requireFile(repoRoot, file);
  }

  const packageJson = readFileSync(path.join(repoRoot, "package.json"), "utf8");
  assert.equal(packageJson.includes('"validate:phase2-rn-android-acceptance"'), true);

  const demoPackageJson = readFileSync(path.join(repoRoot, "examples/rn-login-demo/package.json"), "utf8");
  assert.equal(demoPackageJson.includes('"expo"'), true);
  assert.equal(demoPackageJson.includes('"start"'), true);

  const appSource = readFileSync(path.join(repoRoot, "examples/rn-login-demo/App.tsx"), "utf8");
  assert.equal(appSource.includes('testID="phone-input"'), true);
  assert.equal(appSource.includes('testID="password-input"'), true);
  assert.equal(appSource.includes('testID="login-button"'), true);
  assert.equal(appSource.includes('testID="welcome-home"'), true);

  const showcaseReadme = readFileSync(path.join(repoRoot, "docs/showcase/README.md"), "utf8");
  assert.equal(showcaseReadme.includes('validate:phase2-rn-android-acceptance'), true);

  const flow = readFileSync(path.join(repoRoot, "flows/samples/react-native/android-login-smoke.yaml"), "utf8");
  assert.equal(flow.includes('appId: com.anonymous.rnlogindemo'), true);

  console.log("Phase 2 RN Android prerequisite validation passed.");
}

main();
