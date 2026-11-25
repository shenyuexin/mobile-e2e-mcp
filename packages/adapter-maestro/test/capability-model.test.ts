import assert from "node:assert/strict";
import test from "node:test";
import { buildCapabilityProfile } from "../src/capability-model.ts";

test("Android capability profile includes wait_for_ui_stable", () => {
  const profile = buildCapabilityProfile("android");
  const tool = profile.toolCapabilities.find((t) => t.toolName === "wait_for_ui_stable");
  assert.ok(tool, "wait_for_ui_stable should be in Android tool capabilities");
  assert.equal(tool?.supportLevel, "full");
});

test("iOS capability profile includes wait_for_ui_stable", () => {
  const profile = buildCapabilityProfile("ios");
  const tool = profile.toolCapabilities.find((t) => t.toolName === "wait_for_ui_stable");
  assert.ok(tool, "wait_for_ui_stable should be in iOS tool capabilities");
  assert.equal(tool?.supportLevel, "full");
});

test("Android ui_inspection group includes wait_for_ui_stable", () => {
  const profile = buildCapabilityProfile("android");
  const group = profile.groups.find((g) => g.groupName === "ui_inspection");
  assert.ok(group, "ui_inspection group should exist");
  assert.ok(group?.toolNames.includes("wait_for_ui_stable"), "ui_inspection should include wait_for_ui_stable");
});

test("iOS ui_inspection group includes wait_for_ui_stable", () => {
  const profile = buildCapabilityProfile("ios");
  const group = profile.groups.find((g) => g.groupName === "ui_inspection");
  assert.ok(group, "ui_inspection group should exist");
  assert.ok(group?.toolNames.includes("wait_for_ui_stable"), "ui_inspection should include wait_for_ui_stable");
});

test("Android and iOS capability profiles expose audit_ui_surface as full in ui_inspection", () => {
  for (const platform of ["android", "ios"] as const) {
    const profile = buildCapabilityProfile(platform);
    const tool = profile.toolCapabilities.find((t) => t.toolName === "audit_ui_surface");
    assert.ok(tool, `audit_ui_surface missing on ${platform}`);
    assert.equal(tool?.supportLevel, "full");
    const group = profile.groups.find((g) => g.groupName === "ui_inspection");
    assert.ok(group?.toolNames.includes("audit_ui_surface"), `ui_inspection missing audit_ui_surface on ${platform}`);
  }
});
