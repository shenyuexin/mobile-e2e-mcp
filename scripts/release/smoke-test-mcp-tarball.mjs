#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mcpPkgDir = path.join(repoRoot, "packages/mcp-server");
const pkgJson = JSON.parse(readFileSync(path.join(mcpPkgDir, "package.json"), "utf-8"));
const binBundlePath = path.join(mcpPkgDir, "bundle/bin-stdio.cjs");

if (!existsSync(binBundlePath)) {
  throw new Error(`Missing bundled CLI binary at ${binBundlePath}. Run "pnpm --filter @shenyuexin/mobile-e2e-mcp run bundle" first.`);
}

const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "m2e-tarball-smoke-"));
const packDir = path.join(tmpRoot, "pack");
const installDir = path.join(tmpRoot, "consumer");
mkdirSync(packDir, { recursive: true });
mkdirSync(installDir, { recursive: true });

try {
  execFileSync(
    "pnpm",
    ["--filter", "@shenyuexin/mobile-e2e-mcp", "pack", "--pack-destination", packDir],
    { cwd: repoRoot, stdio: "inherit" },
  );

  const tarballs = readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, `Expected 1 packed tarball in ${packDir}, found ${tarballs.length}`);
  const tarballPath = path.join(packDir, tarballs[0]);

  execFileSync("npm", ["init", "-y"], { cwd: installDir, stdio: "ignore" });
  execFileSync("npm", ["install", "--no-save", tarballPath], { cwd: installDir, stdio: "inherit" });

  const binPath = path.join(installDir, "node_modules/.bin", process.platform === "win32" ? "mobile-e2e-mcp.cmd" : "mobile-e2e-mcp");
  assert.equal(existsSync(binPath), true, `Installed CLI binary missing at ${binPath}`);

  const runBin = (args) =>
    spawnSync(binPath, args, {
      cwd: installDir,
      encoding: "utf-8",
      shell: process.platform === "win32",
    });

  const versionRes = runBin(["--version"]);
  assert.equal(versionRes.status, 0, `--version failed: ${versionRes.stderr}`);
  assert.equal(versionRes.stdout.trim(), pkgJson.version);

  const helpRes = runBin(["--help"]);
  assert.equal(helpRes.status, 0, `--help failed: ${helpRes.stderr}`);
  for (const cmd of ["doctor", "init", "explore", "run", "audit", "diff", "verify", "setup-agent"]) {
    assert.match(helpRes.stdout, new RegExp(`\\b${cmd}\\b`), `--help must list ${cmd}`);
  }

  const verifyHelpRes = runBin(["verify", "--help"]);
  assert.equal(verifyHelpRes.status, 0, `verify --help failed: ${verifyHelpRes.stderr}`);
  assert.match(verifyHelpRes.stdout, /--fail-on-regression/);

  const badFlagRes = runBin(["run", "--definitely-unknown-flag"]);
  assert.equal(badFlagRes.status, 2, `Unknown run flag must exit 2, got ${badFlagRes.status}`);

  console.log(`Tarball CLI smoke passed for @shenyuexin/mobile-e2e-mcp@${pkgJson.version}`);
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
