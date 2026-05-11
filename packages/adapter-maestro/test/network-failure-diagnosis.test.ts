import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { diagnoseNetworkFailureWithMaestro } from "../src/network-failure-diagnosis.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdir(path.join(os.tmpdir(), `network-failure-${Date.now()}-`), { recursive: true });
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("android HTTP failure is attributed to cleartext policy when manifest blocks HTTP", async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, "AndroidManifest.xml");
    await writeFile(manifestPath, `<manifest><application android:label="Demo"/></manifest>`, "utf8");

    const result = await diagnoseNetworkFailureWithMaestro({
      sessionId: "android-cleartext-diagnosis",
      platform: "android",
      releaseHint: "release",
      failedRequest: {
        url: "http://api.example.com/login",
        errorText: "CLEARTEXT communication to api.example.com not permitted",
        source: "manual",
      },
      androidManifestPath: manifestPath,
    });

    assert.equal(result.status, "success");
    assert.equal(result.data.classification.reason, "likely_android_cleartext_blocked");
    assert.equal(result.data.classification.policyRelated, true);
    assert.equal(result.data.confidence, "high");
    assert.equal(result.data.policyInspection?.findings[0]?.status, "blocked");
  });
});

test("ios HTTP failure is attributed to ATS when Info.plist has no exception", async () => {
  await withTempDir(async (dir) => {
    const plistPath = path.join(dir, "Info.plist");
    await writeFile(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0"><dict><key>CFBundleName</key><string>Demo</string></dict></plist>
    `, "utf8");

    const result = await diagnoseNetworkFailureWithMaestro({
      sessionId: "ios-ats-diagnosis",
      platform: "ios",
      releaseHint: "release",
      failedRequest: {
        url: "http://api.example.com/login",
        errorText: "The resource could not be loaded because the App Transport Security policy requires HTTPS.",
        source: "manual",
      },
      iosInfoPlistPath: plistPath,
    });

    assert.equal(result.data.classification.reason, "likely_ios_ats_blocked");
    assert.equal(result.data.classification.policyRelated, true);
    assert.equal(result.data.releaseAssessment.releaseLike, true);
  });
});

test("policy-allowed HTTP status failure is attributed outside release policy", async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, "AndroidManifest.xml");
    await writeFile(manifestPath, `<manifest><application android:usesCleartextTraffic="true"/></manifest>`, "utf8");

    const result = await diagnoseNetworkFailureWithMaestro({
      sessionId: "http-status-diagnosis",
      platform: "android",
      releaseHint: "release",
      failedRequest: {
        url: "http://api.example.com/login",
        status: 500,
        statusText: "Internal Server Error",
        source: "manual",
      },
      androidManifestPath: manifestPath,
    });

    assert.equal(result.data.classification.reason, "http_status_error");
    assert.equal(result.data.classification.policyRelated, false);
    assert.equal(result.data.policyInspection?.findings[0]?.status, "allowed");
  });
});

test("HTTPS failures are not classified as cleartext or ATS policy blockers", async () => {
  const result = await diagnoseNetworkFailureWithMaestro({
    sessionId: "https-diagnosis",
    platform: "android",
    releaseHint: "release",
    failedRequest: {
      url: "https://api.example.com/login",
      errorText: "Timed out",
      source: "manual",
    },
  });

  assert.equal(result.data.classification.reason, "https_not_cleartext_policy_related");
  assert.equal(result.data.classification.policyRelated, false);
  assert.equal(result.data.policyInspection, undefined);
});

test("failed JS network events can provide the analyzed request", async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, "AndroidManifest.xml");
    await writeFile(manifestPath, `<manifest><application android:label="Demo"/></manifest>`, "utf8");

    const result = await diagnoseNetworkFailureWithMaestro({
      sessionId: "js-network-event-diagnosis",
      platform: "android",
      releaseHint: "release",
      events: [
        { requestId: "ok", url: "https://api.example.com/health", status: 200 },
        { requestId: "blocked", url: "http://api.example.com/login", errorText: "Network request failed" },
      ],
      androidManifestPath: manifestPath,
    });

    assert.equal(result.data.analyzedRequest?.url, "http://api.example.com/login");
    assert.equal(result.data.analyzedRequest?.source, "js_debug");
    assert.equal(result.data.classification.reason, "likely_android_cleartext_blocked");
  });
});

test("missing failed request returns an explicit invalid request diagnosis", async () => {
  const result = await diagnoseNetworkFailureWithMaestro({
    sessionId: "missing-request-diagnosis",
    platform: "android",
    releaseHint: "release",
  });

  assert.equal(result.status, "success");
  assert.equal(result.data.classification.reason, "invalid_or_missing_failed_request");
  assert.equal(result.data.confidence, "low");
  assert.match(result.nextSuggestions.join("\n"), /failedRequest/i);
});
