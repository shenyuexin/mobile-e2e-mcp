import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const thisDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(thisDir, "..", "..");

test("mcp-server build script prepares explorer before TypeScript compile", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(repoRoot, "packages/mcp-server/package.json"), "utf8")
  ) as {
    scripts?: Record<string, string>;
  };

  const buildScript = pkg.scripts?.build ?? "";

  assert.match(buildScript, /--filter @mobile-e2e-mcp\/explorer build/);
  assert.ok(
    buildScript.indexOf("--filter @mobile-e2e-mcp/explorer build") < buildScript.indexOf("tsc -p tsconfig.json"),
    "explorer must be built before mcp-server tsc resolves its package types"
  );
});
