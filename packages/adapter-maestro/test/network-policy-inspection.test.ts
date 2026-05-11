import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectNetworkPolicyWithMaestro } from "../src/network-policy-inspection.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdir(path.join(os.tmpdir(), `network-policy-${Date.now()}-`), { recursive: true });
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("android manifest without cleartext allowance blocks HTTP endpoints", async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, "AndroidManifest.xml");
    await writeFile(manifestPath, `<manifest><application android:label="Demo"/></manifest>`, "utf8");

    const result = await inspectNetworkPolicyWithMaestro({
      sessionId: "android-blocked",
      platform: "android",
      urls: ["http://api.example.com/login"],
      androidManifestPath: manifestPath,
    });

    assert.equal(result.status, "success");
    assert.equal(result.reasonCode, "OK");
    assert.equal(result.data.overallStatus, "blocked");
    assert.equal(result.data.findings[0]?.status, "blocked");
    assert.equal(result.data.findings[0]?.reason, "android_cleartext_not_permitted");
  });
});

test("android usesCleartextTraffic true allows HTTP endpoints globally", async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, "AndroidManifest.xml");
    await writeFile(manifestPath, `<manifest><application android:usesCleartextTraffic="true"/></manifest>`, "utf8");

    const result = await inspectNetworkPolicyWithMaestro({
      sessionId: "android-global-allowed",
      platform: "android",
      urls: ["http://api.example.com/login"],
      androidManifestPath: manifestPath,
    });

    assert.equal(result.data.overallStatus, "allowed");
    assert.equal(result.data.findings[0]?.status, "allowed");
    assert.equal(result.data.findings[0]?.matchedRule, "usesCleartextTraffic=true");
  });
});

test("android network security config allows only matching domains", async () => {
  await withTempDir(async (dir) => {
    const manifestPath = path.join(dir, "AndroidManifest.xml");
    const networkSecurityConfigPath = path.join(dir, "network_security_config.xml");
    await writeFile(manifestPath, `<manifest><application android:networkSecurityConfig="@xml/network_security_config"/></manifest>`, "utf8");
    await writeFile(networkSecurityConfigPath, `
      <network-security-config>
        <domain-config cleartextTrafficPermitted="true">
          <domain includeSubdomains="true">example.com</domain>
        </domain-config>
      </network-security-config>
    `, "utf8");

    const result = await inspectNetworkPolicyWithMaestro({
      sessionId: "android-domain-allowlist",
      platform: "android",
      urls: ["http://api.example.com/login", "http://blocked.test/login"],
      androidManifestPath: manifestPath,
      androidNetworkSecurityConfigPath: networkSecurityConfigPath,
    });

    assert.equal(result.data.overallStatus, "blocked");
    assert.equal(result.data.findings[0]?.status, "allowed");
    assert.equal(result.data.findings[0]?.matchedRule, "networkSecurityConfig:example.com");
    assert.equal(result.data.findings[1]?.status, "blocked");
  });
});

test("ios default ATS blocks HTTP endpoints", async () => {
  await withTempDir(async (dir) => {
    const plistPath = path.join(dir, "Info.plist");
    await writeFile(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0"><dict><key>CFBundleName</key><string>Demo</string></dict></plist>
    `, "utf8");

    const result = await inspectNetworkPolicyWithMaestro({
      sessionId: "ios-ats-blocked",
      platform: "ios",
      urls: ["http://api.example.com/login"],
      iosInfoPlistPath: plistPath,
    });

    assert.equal(result.data.overallStatus, "blocked");
    assert.equal(result.data.findings[0]?.status, "blocked");
    assert.equal(result.data.findings[0]?.reason, "ios_ats_requires_https");
  });
});

test("ios ATS exception domain allows matching HTTP endpoint", async () => {
  await withTempDir(async (dir) => {
    const plistPath = path.join(dir, "Info.plist");
    await writeFile(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0">
        <dict>
          <key>NSAppTransportSecurity</key>
          <dict>
            <key>NSExceptionDomains</key>
            <dict>
              <key>example.com</key>
              <dict>
                <key>NSIncludesSubdomains</key><true/>
                <key>NSExceptionAllowsInsecureHTTPLoads</key><true/>
              </dict>
            </dict>
          </dict>
        </dict>
      </plist>
    `, "utf8");

    const result = await inspectNetworkPolicyWithMaestro({
      sessionId: "ios-ats-allowed",
      platform: "ios",
      urls: ["http://api.example.com/login"],
      iosInfoPlistPath: plistPath,
    });

    assert.equal(result.data.overallStatus, "allowed");
    assert.equal(result.data.findings[0]?.status, "allowed");
    assert.equal(result.data.findings[0]?.matchedRule, "NSExceptionDomains:example.com");
  });
});

test("https endpoints are not applicable to HTTP policy checks", async () => {
  const result = await inspectNetworkPolicyWithMaestro({
    sessionId: "https-not-applicable",
    platform: "android",
    urls: ["https://api.example.com/login"],
  });

  assert.equal(result.data.overallStatus, "not_applicable");
  assert.equal(result.data.findings[0]?.status, "not_applicable");
  assert.equal(result.data.findings[0]?.reason, "https_endpoint_not_subject_to_cleartext_policy");
});

test("missing policy evidence returns unknown for HTTP endpoints", async () => {
  const result = await inspectNetworkPolicyWithMaestro({
    sessionId: "missing-policy-evidence",
    platform: "android",
    urls: ["http://api.example.com/login"],
  });

  assert.equal(result.data.overallStatus, "unknown");
  assert.equal(result.data.findings[0]?.status, "unknown");
  assert.match(result.nextSuggestions.join("\n"), /AndroidManifest/i);
});
