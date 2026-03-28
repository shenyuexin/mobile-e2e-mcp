import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveInstallTargetPreset } from "./export-canonical-skills-lib.ts";

test("resolveInstallTargetPreset returns opencode-config path", () => {
  const expected = path.join(process.env.HOME ?? "", ".config", "opencode", "skills");
  assert.equal(resolveInstallTargetPreset("opencode-config"), expected);
});

test("resolveInstallTargetPreset returns opencode-home path", () => {
  const expected = path.join(process.env.HOME ?? "", ".opencode", "skills");
  assert.equal(resolveInstallTargetPreset("opencode-home"), expected);
});
