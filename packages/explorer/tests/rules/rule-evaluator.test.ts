import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDefaultConfig } from "../../src/config.js";
import {
	evaluateElementRules,
	evaluatePageRules,
	evaluateSamplingRules,
} from "../../src/rules/rule-evaluator.js";
import { buildExplorerRuleRegistry } from "../../src/rules/rule-registry.js";
import type {
	ClickableTarget,
	ExplorerConfig,
	PageSnapshot,
} from "../../src/types.js";

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
	return {
		screenId: "screen-1",
		screenTitle: "System Fonts",
		uiTree: { clickable: false, enabled: true, scrollable: false },
		clickableElements: [],
		screenshotPath: "",
		capturedAt: "2026-04-29T00:00:00.000Z",
		arrivedFrom: null,
		viaElement: null,
		depth: 3,
		loadTimeMs: 0,
		stabilityScore: 1,
		appId: "com.apple.Preferences",
		pageContext: {
			type: "normal_page",
			platform: "ios",
			detectionSource: "heuristic",
			confidence: 0.9,
		},
		...overrides,
	};
}

function element(label: string): ClickableTarget {
	return {
		label,
		selector: {
			text: label,
			resourceId: `id-${label.toLowerCase().replace(/\s+/g, "-")}`,
		},
		elementType: "TextView",
	};
}

function registry(config: Partial<ExplorerConfig> = {}) {
	return buildExplorerRuleRegistry(buildDefaultConfig(config));
}

describe("rule evaluator", () => {
	it("matches Fonts sampling only in smoke mode", () => {
		const rules = registry({ mode: "smoke" });
		const smoke = evaluateSamplingRules(rules, {
			path: ["General", "Fonts", "System Fonts"],
			depth: 3,
			mode: "smoke",
			platform: "ios-simulator",
			snapshot: snapshot(),
		});
		const full = evaluateSamplingRules(rules, {
			path: ["General", "Fonts", "System Fonts"],
			depth: 3,
			mode: "full",
			platform: "ios-simulator",
			snapshot: snapshot(),
		});

		assert.equal(smoke.matched, true);
		assert.equal(smoke.ruleId, "default.ios.fonts.system-fonts.smoke-sampling");
		assert.deepEqual(smoke.sampling?.excludeActions, ["Download"]);
		assert.equal(full.matched, false);
	});

	it("matches Bluetooth and SIM page skip rules", () => {
		const rules = registry({ platform: "android-device" });
		assert.equal(
			evaluatePageRules(rules, {
				path: ["Bluetooth", "Other devices"],
				depth: 2,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Other devices" }),
			}).ruleId,
			"default.android.bluetooth.other-devices.page-skip",
		);
		assert.equal(
			evaluatePageRules(rules, {
				path: ["SIMs & mobile network"],
				depth: 1,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "SIMs & mobile network" }),
			}).ruleId,
			"default.android.network.sims-mobile-network.page-skip",
		);
	});

	it("gates Android safe-smoke sensitive Settings pages and elements", () => {
		const rules = registry({ platform: "android-device", mode: "smoke" });
		for (const screenTitle of [
			"SIMs & mobile network",
			"vivo account",
			"Privacy",
			"Security",
			"Developer options",
			"Payment methods",
		]) {
			const decision = evaluatePageRules(rules, {
				path: ["Settings", screenTitle],
				depth: 1,
				mode: "smoke",
				platform: "android-device",
				snapshot: snapshot({ screenTitle }),
			});
			assert.ok(decision.matched, `${screenTitle} should be gated`);
			assert.ok(
				[
					"default.android.network.sims-mobile-network.page-skip",
					"default.android.safe-smoke.sensitive-settings.page-gate",
				].includes(decision.ruleId ?? ""),
				`${screenTitle} matched unexpected rule ${decision.ruleId ?? "(none)"}`,
			);
		}

		for (const label of [
			"SIMs & mobile network",
			"vivo account, vivo Cloud, Find Devices, and more",
			"Privacy",
			"Security",
			"Developer options",
			"Payment methods",
		]) {
			const decision = evaluateElementRules(rules, {
				path: ["Settings"],
				depth: 0,
				mode: "smoke",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Settings" }),
				element: element(label),
			});
			assert.equal(
				decision.ruleId,
				"default.android.safe-smoke.sensitive-settings.element-skip",
				`${label} should be skipped by safe-smoke element rule`,
			);
		}
	});

	it("matches Help/FAQ element skips", () => {
		const rules = registry();
		assert.equal(
			evaluateElementRules(rules, {
				path: ["Settings"],
				depth: 1,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Settings" }),
				element: element("Help"),
			}).ruleId,
			"default.element.help.low-value-skip",
		);
		assert.equal(
			evaluateElementRules(rules, {
				path: ["Help"],
				depth: 2,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Help" }),
				element: element("How do I pair a device?"),
			}).ruleId,
			"default.element.faq.low-value-skip",
		);
	});

	it("respects destructive and stateful allow policies", () => {
		const skipRules = registry({
			destructiveActionPolicy: "skip",
			statefulFormPolicy: "skip",
		});
		const allowRules = registry({
			destructiveActionPolicy: "allow",
			statefulFormPolicy: "allow",
		});

		assert.equal(
			evaluateElementRules(skipRules, {
				path: ["Account"],
				depth: 2,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Account" }),
				element: element("Delete account"),
			}).matched,
			true,
		);
		assert.equal(
			evaluateElementRules(allowRules, {
				path: ["Account"],
				depth: 2,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Account" }),
				element: element("Delete account"),
			}).matched,
			false,
		);
		assert.equal(
			evaluatePageRules(skipRules, {
				path: ["Create Payment Method"],
				depth: 2,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Create Payment Method" }),
			}).matched,
			true,
		);
		assert.equal(
			evaluatePageRules(allowRules, {
				path: ["Create Payment Method"],
				depth: 2,
				mode: "full",
				platform: "android-device",
				snapshot: snapshot({ screenTitle: "Create Payment Method" }),
			}).matched,
			false,
		);
	});
});
