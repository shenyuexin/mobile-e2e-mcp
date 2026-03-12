import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeOcrText, type MacVisionExecutionResult } from "../src/index.ts";

interface OcrFixtureManifestEntry {
  name: string;
  targetText: string;
  expectedObservationCount: number;
  expectedTexts: string[];
}

interface OcrFixtureManifest {
  fixtures: OcrFixtureManifestEntry[];
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ocrFixtureRoot = path.join(repoRoot, "tests", "fixtures", "ocr");

async function loadManifest(): Promise<OcrFixtureManifest> {
  return JSON.parse(await readFile(path.join(ocrFixtureRoot, "manifest.json"), "utf8")) as OcrFixtureManifest;
}

test("OCR fixture manifest stays in sync with screenshot observation triads", async () => {
  const manifest = await loadManifest();
  assert.equal(manifest.fixtures.length >= 4, true);

  for (const fixture of manifest.fixtures) {
    const pngPath = path.join(ocrFixtureRoot, `${fixture.name}.png`);
    const svgPath = path.join(ocrFixtureRoot, `${fixture.name}.svg`);
    const observationsPath = path.join(ocrFixtureRoot, `${fixture.name}.observations.json`);

    await access(pngPath);
    await access(svgPath);
    await access(observationsPath);

    const pngStats = await stat(pngPath);
    assert.equal(pngStats.size > 0, true, `${fixture.name}.png should be non-empty`);

    const svgContent = await readFile(svgPath, "utf8");
    assert.equal(svgContent.includes(fixture.targetText), true, `${fixture.name}.svg should contain target text`);

    const observations = JSON.parse(await readFile(observationsPath, "utf8")) as MacVisionExecutionResult;
    assert.equal(observations.observations?.length, fixture.expectedObservationCount, `${fixture.name} should keep expected observation count`);

    const observationTexts = (observations.observations ?? []).map((item) => normalizeOcrText(item.text ?? ""));
    assert.deepEqual(observationTexts, fixture.expectedTexts.map((value) => normalizeOcrText(value)), `${fixture.name} observation texts should match manifest`);
    assert.equal(observationTexts.includes(normalizeOcrText(fixture.targetText)), true, `${fixture.name} observations should include target text`);
  }
});
