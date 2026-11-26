import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeInit } from "../src/cli/init-command.ts";
import { loadProjectConfig } from "../src/cli/project-config.ts";
import { detectProject } from "../src/cli/project-detector.ts";

async function makeDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFixture(cwd: string, relativePath: string, content: string): Promise<void> {
  const target = path.join(cwd, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf-8");
}

test("detectProject identifies Android projects", async () => {
  const dir = await makeDir("m2e-detect-android-");
  try {
    await writeFixture(dir, "app/build.gradle", 'android { defaultConfig { applicationId "com.acme.android" } }');
    const detected = detectProject(dir);
    assert.equal(detected.kind, "android");
    assert.equal(detected.platform, "android");
    assert.equal(detected.appId, "com.acme.android");
    assert.equal(detected.runnerProfile, "native_android");
    assert.equal(detected.buildCommand, "./gradlew assembleDebug");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject identifies iOS projects", async () => {
  const dir = await makeDir("m2e-detect-ios-");
  try {
    await writeFixture(
      dir,
      "ios/App.xcodeproj/project.pbxproj",
      'PRODUCT_BUNDLE_IDENTIFIER = com.acme.ios;',
    );
    const detected = detectProject(dir);
    assert.equal(detected.kind, "ios");
    assert.equal(detected.platform, "ios");
    assert.equal(detected.appId, "com.acme.ios");
    assert.equal(detected.runnerProfile, "native_ios");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject identifies React Native / Expo projects", async () => {
  const dir = await makeDir("m2e-detect-expo-");
  try {
    await writeFixture(
      dir,
      "app.json",
      JSON.stringify({ expo: { android: { package: "com.acme.expo" }, ios: { bundleIdentifier: "com.acme.expo.ios" } } }),
    );
    const detected = detectProject(dir);
    assert.equal(detected.kind, "expo");
    assert.equal(detected.appId, "com.acme.expo");
    assert.equal(detected.buildCommand, "npx expo run:android");

    await rm(path.join(dir, "app.json"));
    await writeFixture(dir, "app.json", JSON.stringify({ name: "rn-app", displayName: "RN App" }));
    const rn = detectProject(dir);
    assert.equal(rn.kind, "react-native");
    assert.equal(rn.runnerProfile, "native_android");

    await rm(path.join(dir, "app.json"));
    await writeFixture(dir, "app.config.json", JSON.stringify({ name: "expo-app" }));
    assert.equal(detectProject(dir).kind, "expo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject identifies Flutter projects and prefers them over native folders", async () => {
  const dir = await makeDir("m2e-detect-flutter-");
  try {
    await writeFixture(dir, "pubspec.yaml", "name: acme_app\n");
    await writeFixture(dir, "android/app/build.gradle", 'applicationId "com.acme.flutter"');
    const detected = detectProject(dir);
    assert.equal(detected.kind, "flutter");
    assert.equal(detected.platform, "android");
    assert.equal(detected.appId, "com.acme.flutter");
    assert.equal(detected.runnerProfile, "flutter_android");
    assert.equal(detected.buildCommand, "flutter build apk --debug");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("detectProject returns unknown for an empty workspace", async () => {
  const dir = await makeDir("m2e-detect-empty-");
  try {
    const detected = detectProject(dir);
    assert.equal(detected.kind, "unknown");
    assert.equal(detected.appId, undefined);
    assert.deepEqual(detected.evidence, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init auto-detects project defaults and scaffolds a smoke flow on request", async () => {
  const dir = await makeDir("m2e-init-detect-");
  try {
    await writeFixture(dir, "app/build.gradle.kts", 'applicationId = "com.acme.kts"');

    const initResult = await executeInit(["--no-prompt", "--with-smoke-flow"], {
      cwd: dir,
      isInteractive: false,
    });
    assert.equal(initResult.exitCode, 0);
    const loaded = await loadProjectConfig(dir);
    assert.equal(loaded?.config.platform, "android");
    assert.equal(loaded?.config.appId, "com.acme.kts");
    assert.equal(loaded?.config.runnerProfile, "native_android");
    assert.equal(loaded?.config.buildCommand, "./gradlew assembleDebug");
    assert.equal(loaded?.config.flowPath, ".e2e/flows/smoke.yaml");

    const flow = await readFile(path.join(dir, ".e2e", "flows", "smoke.yaml"), "utf-8");
    assert.match(flow, /appId: "com\.acme\.kts"/);
    assert.match(flow, /- launchApp:/);
    assert.match(flow, /timeout: 3000/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("init --no-smoke-flow does not create a flow, and explicit flags win over detection", async () => {
  const dir = await makeDir("m2e-init-nosmoke-");
  try {
    await writeFixture(dir, "app/build.gradle", 'applicationId "com.detected.app"');
    const result = await executeInit(
      ["--no-prompt", "--no-smoke-flow", "--platform", "ios", "--app-id", "com.explicit.app"],
      { cwd: dir, isInteractive: false },
    );
    assert.equal(result.exitCode, 0);
    const loaded = await loadProjectConfig(dir);
    assert.equal(loaded?.config.platform, "ios");
    assert.equal(loaded?.config.appId, "com.explicit.app");
    assert.equal(loaded?.config.flowPath, undefined);
    assert.equal(existsSync(path.join(dir, ".e2e", "flows", "smoke.yaml")), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
