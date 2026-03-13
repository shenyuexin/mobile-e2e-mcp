import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { executeMacVisionOcr } from "../packages/adapter-vision/src/index.ts";

interface OcrFixtureManifestEntry {
  name: string;
  targetText: string;
  expectedObservationCount: number;
  expectedTexts: string[];
}

interface OcrFixtureManifest {
  fixtures: OcrFixtureManifestEntry[];
}

function repoRootFromScript(): string {
  const scriptPath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(scriptPath), "..");
}

function sha256(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

function readPngDimensions(png: Buffer): { width: number; height: number } {
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

async function runSips(svgPath: string, pngPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("sips", ["-s", "format", "png", svgPath, "--out", pngPath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `sips exited with code ${String(code)}`));
    });
  });
}

async function loadManifest(root: string): Promise<OcrFixtureManifest> {
  return JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as OcrFixtureManifest;
}

async function syncFixture(root: string, fixture: OcrFixtureManifestEntry): Promise<void> {
  const svgPath = path.join(root, `${fixture.name}.svg`);
  const pngPath = path.join(root, `${fixture.name}.png`);
  const observationsPath = path.join(root, `${fixture.name}.observations.json`);

  await runSips(svgPath, pngPath);
  const execution = await executeMacVisionOcr({ screenshotPath: pngPath, platform: "ios", languageHints: ["en-US"] });
  const svg = await readFile(svgPath);
  const png = await readFile(pngPath);

  const payload = {
    durationMs: Math.max(0, Math.round(execution.durationMs ?? 0)),
    model: execution.model ?? "VNRecognizeTextRequest.accurate",
    observations: execution.observations ?? [],
    metadata: {
      svgSha256: sha256(svg),
      pngSha256: sha256(png),
      dimensions: readPngDimensions(png),
      sourceSvg: path.basename(svgPath),
      sourcePng: path.basename(pngPath),
    },
  };

  await writeFile(observationsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("OCR fixture sync requires macOS because it uses sips and Mac Vision OCR.");
  }
  const fixtureRoot = path.join(repoRootFromScript(), "tests", "fixtures", "ocr");
  const manifest = await loadManifest(fixtureRoot);
  const requested = new Set(process.argv.slice(2));
  const validNames = new Set(manifest.fixtures.map((fixture) => fixture.name));
  const unknownNames = Array.from(requested).filter((name) => !validNames.has(name));
  if (unknownNames.length > 0) {
    throw new Error(`Unknown OCR fixture name(s): ${unknownNames.join(", ")}. Valid names: ${Array.from(validNames).join(", ")}.`);
  }

  let syncedCount = 0;
  for (const fixture of manifest.fixtures) {
    if (requested.size > 0 && !requested.has(fixture.name)) {
      continue;
    }
    await syncFixture(fixtureRoot, fixture);
    syncedCount += 1;
  }

  if (syncedCount === 0) {
    throw new Error("No OCR fixtures were synced.");
  }

  console.log(`Synced ${String(syncedCount)} OCR fixture(s)${requested.size > 0 ? `: ${Array.from(requested).join(", ")}` : ""}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
