import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { Jimp } from "jimp";
import {
	attachFailureReviewVisualBaselineComparisons,
	generateFailureReviewJson,
	generateFailureReviewMarkdown,
	parseExplorerLogSignals,
} from "../../src/report/failure-review.js";
import type { ExplorerConfig, FailureEntry, PageEntry } from "../../src/types.js";

const fixtureConfig: ExplorerConfig = {
	mode: "full",
	auth: { type: "skip-auth" },
	failureStrategy: "retry-3",
	maxDepth: 6,
	maxPages: 40,
	timeoutMs: 180_000,
	compareWith: null,
	platform: "android-device",
	destructiveActionPolicy: "skip",
	appId: "com.android.settings",
	reportDir: "/tmp/explorer-fixture",
};

function page(id: string, title: string, depth: number): PageEntry {
	return {
		id,
		screenId: id,
		screenTitle: title,
		depth,
		path: ["Settings", title],
		arrivedFrom: null,
		viaElement: null,
		loadTimeMs: 75,
		clickableCount: 8,
		hasFailure: false,
	};
}

function failure(
	pageScreenId: string,
	failureType: FailureEntry["failureType"],
	elementLabel: string,
	errorMessage = `${failureType} fixture`,
): FailureEntry {
	return {
		pageScreenId,
		elementLabel,
		failureType,
		retryCount: failureType === "TIMEOUT" ? 3 : 1,
		errorMessage,
		depth: 2,
		path: ["Settings", pageScreenId, elementLabel],
	};
}

describe("failure review fixture pack", () => {
	it("groups each supported failure type into a stable diagnostic category", () => {
		const review = generateFailureReviewJson(
			[
				page("network", "Network", 1),
				page("apps", "Apps", 1),
				page("battery", "Battery", 1),
				page("security", "Security", 1),
				page("display", "Display", 1),
			],
			[
				failure("network", "BACKTRACK_MISMATCH", "Wi-Fi"),
				failure("apps", "TAP_FAILED", "App info"),
				failure("battery", "TIMEOUT", "Battery usage"),
				failure("security", "CRASH", "Security update"),
				failure("display", "INTERRUPTED", "Brightness"),
			],
			fixtureConfig,
			{ partial: false, durationMs: 65_000 },
		);

		const categories = new Map(review.patterns.map((pattern) => [pattern.category, pattern]));
		assert.equal(categories.get("navigation-backtrack")?.failureTypes.BACKTRACK_MISMATCH, 1);
		assert.equal(categories.get("interaction-targeting")?.failureTypes.TAP_FAILED, 1);
		assert.equal(categories.get("stability-timeout")?.failureTypes.TIMEOUT, 1);
		assert.equal(categories.get("app-crash")?.failureTypes.CRASH, 1);
		assert.equal(categories.get("run-interruption")?.failureTypes.INTERRUPTED, 1);
		assert.equal(review.totalFailures, 5);
	});

	it("keeps partial abort context and rule decision summaries report-visible", () => {
		const networkPage = page("network", "Network", 1);
		networkPage.ruleDecision = {
			ruleId: "default.android.network.sims-mobile-network.page-skip",
			category: "stateful-settings",
			action: "skip-page",
			reason: "Stateful mobile network settings",
			path: ["Settings", "Network"],
		};
		networkPage.ruleDecisions = [
			{
				ruleId: "default.element.sims-mobile-network.skip",
				category: "stateful-settings",
				action: "skip-element",
				reason: "Stateful mobile network settings",
				path: ["Settings", "Network", "SIMs"],
				elementLabel: "SIMs",
			},
		];

		const review = generateFailureReviewJson(
			[networkPage],
			[failure("network", "TIMEOUT", "SIMs")],
			fixtureConfig,
			{ partial: true, abortReason: "circuit-breaker", durationMs: 5_000 },
		);
		const markdown = generateFailureReviewMarkdown(review);

		assert.equal(review.status, "partial");
		assert.equal(review.abortReason, "circuit-breaker");
		assert.equal(review.ruleDecisionContext?.byCategory["stateful-settings"], 2);
		assert.equal(review.ruleDecisionContext?.byAction["skip-page"], 1);
		assert.equal(review.ruleDecisionContext?.byAction["skip-element"], 1);
		assert.ok(markdown.includes("Abort Reason"));
		assert.ok(markdown.includes("default.android.network.sims-mobile-network.page-skip"));
	});

	it("caps log signal examples while preserving aggregate counts", () => {
		const logText = Array.from({ length: 20 }, (_, index) =>
			`[BACKTRACK-WARN] method=tap_back_button:text, status=partial, reason=NO_MATCH, index=${index}`,
		).join("\n");

		const signals = parseExplorerLogSignals(logText);

		assert.equal(signals.backtrackWarnings.total, 20);
		assert.equal(signals.backtrackWarnings.byMethod["tap_back_button:text"], 20);
		assert.equal(signals.reasonCodes.NO_MATCH, 20);
	assert.equal(signals.examples.length, 12);
	});

	it("attaches element crop visual evidence to failed elements when snapshot bounds exist", () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "explorer-visual-evidence-"));
		const screenshotPath = path.join(tmpDir, "screen.png");
		writeFileSync(
			screenshotPath,
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFElEQVR42mP8z8AARLJgwiM3gqUBAGBNCf7+2d8AAAAASUVORK5CYII=",
				"base64",
			),
		);

		const pageEntry = page("network", "Network", 1);
		pageEntry.snapshot = {
			screenId: "network",
			screenTitle: "Network",
			uiTree: {
				clickable: false,
				enabled: true,
				scrollable: false,
				children: [
					{
						text: "SIMs",
						clickable: true,
						enabled: true,
						scrollable: false,
						bounds: "[1,2][7,8]",
					},
				],
			},
			clickableElements: [],
			screenshotPath,
			capturedAt: "2026-05-17T00:00:00.000Z",
			arrivedFrom: null,
			viaElement: null,
			depth: 1,
			loadTimeMs: 10,
			stabilityScore: 1,
		};

		const review = generateFailureReviewJson(
			[pageEntry],
			[failure("network", "TAP_FAILED", "SIMs")],
			fixtureConfig,
			{ partial: false, durationMs: 5_000, runDir: tmpDir },
		);
		const evidence = review.failedElements[0]?.visualEvidence;

		assert.equal(evidence?.status, "captured");
		assert.equal(evidence?.baselineStatus, "not_configured");
		assert.deepEqual(evidence?.bounds, { x: 1, y: 2, width: 6, height: 6 });
		assert.ok(evidence?.elementCropPath?.startsWith("visual-evidence/"));
		assert.ok(existsSync(path.join(tmpDir, evidence?.elementCropPath ?? "")));
		assert.match(
			readFileSync(path.join(tmpDir, evidence?.elementCropPath ?? ""), "utf-8"),
			/<svg[\s\S]*<image /,
		);
		assert.match(generateFailureReviewMarkdown(review), /## Visual Evidence/);
	});

	it("compares failed element crops against managed visual baselines when present", async () => {
		const tmpDir = mkdtempSync(path.join(os.tmpdir(), "explorer-visual-baseline-"));
		const screenshotPath = path.join(tmpDir, "screen.png");
		const screenshot = new Jimp({ width: 10, height: 10, color: 0xff0000ff });
		// @ts-expect-error Jimp v1.x write returns a promise in runtime.
		await screenshot.write(screenshotPath);
		const baselineDir = path.join(
			path.dirname(tmpDir),
			"baselines",
			"com-android-settings",
			"network",
		);
		mkdirSync(baselineDir, { recursive: true });
		const baseline = new Jimp({ width: 6, height: 6, color: 0xff0000ff });
		// @ts-expect-error Jimp v1.x write returns a promise in runtime.
		await baseline.write(path.join(baselineDir, "sims.png"));

		const pageEntry = page("network", "Network", 1);
		pageEntry.snapshot = {
			screenId: "network",
			screenTitle: "Network",
			uiTree: {
				clickable: false,
				enabled: true,
				scrollable: false,
				children: [
					{
						text: "SIMs",
						clickable: true,
						enabled: true,
						scrollable: false,
						bounds: "[1,2][7,8]",
					},
				],
			},
			clickableElements: [],
			screenshotPath,
			capturedAt: "2026-05-17T00:00:00.000Z",
			arrivedFrom: null,
			viaElement: null,
			depth: 1,
			loadTimeMs: 10,
			stabilityScore: 1,
		};

		const review = generateFailureReviewJson(
			[pageEntry],
			[failure("network", "TAP_FAILED", "SIMs")],
			fixtureConfig,
			{ partial: false, durationMs: 5_000, runDir: tmpDir },
		);

		await attachFailureReviewVisualBaselineComparisons(review, [pageEntry], fixtureConfig, {
			runDir: tmpDir,
		});

		const evidence = review.failedElements[0]?.visualEvidence;
		assert.equal(evidence?.baselineStatus, "compared");
		assert.equal(evidence?.comparison?.passed, true);
		assert.ok(evidence?.elementCropPath?.endsWith(".png"));
		assert.match(generateFailureReviewMarkdown(review), /passed 0%/);
	});

	it("emits baseline candidate crops when managed baselines are missing", async () => {
		const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "explorer-baseline-candidate-"));
		const tmpDir = path.join(tmpRoot, "run");
		mkdirSync(tmpDir, { recursive: true });
		const screenshotPath = path.join(tmpDir, "screen.png");
		const screenshot = new Jimp({ width: 10, height: 10, color: 0x00ff00ff });
		// @ts-expect-error Jimp v1.x write returns a promise in runtime.
		await screenshot.write(screenshotPath);

		const pageEntry = page("network", "Network", 1);
		pageEntry.snapshot = {
			screenId: "network",
			screenTitle: "Network",
			uiTree: {
				clickable: false,
				enabled: true,
				scrollable: false,
				children: [
					{
						text: "SIMs",
						clickable: true,
						enabled: true,
						scrollable: false,
						bounds: "[1,2][7,8]",
					},
				],
			},
			clickableElements: [],
			screenshotPath,
			capturedAt: "2026-05-17T00:00:00.000Z",
			arrivedFrom: null,
			viaElement: null,
			depth: 1,
			loadTimeMs: 10,
			stabilityScore: 1,
		};

		const review = generateFailureReviewJson(
			[pageEntry],
			[failure("network", "TAP_FAILED", "SIMs")],
			fixtureConfig,
			{ partial: false, durationMs: 5_000, runDir: tmpDir },
		);

		await attachFailureReviewVisualBaselineComparisons(review, [pageEntry], fixtureConfig, {
			runDir: tmpDir,
		});

		const evidence = review.failedElements[0]?.visualEvidence;
		assert.equal(evidence?.baselineStatus, "missing");
		assert.ok(evidence?.baselinePath?.endsWith("baselines/com-android-settings/network/sims.png"));
		assert.ok(evidence?.baselineCandidatePath?.startsWith("visual-evidence/baseline-candidates/"));
		assert.ok(existsSync(path.join(tmpDir, evidence?.baselineCandidatePath ?? "")));
		assert.match(generateFailureReviewMarkdown(review), /candidate/);
		assert.ok(
			generateFailureReviewMarkdown(review).includes(
				"baselines/com-android-settings/network/sims.png",
			),
		);
	});
});
