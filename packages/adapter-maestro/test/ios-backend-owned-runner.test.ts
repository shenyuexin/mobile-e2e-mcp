import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OwnedRunnerPhysicalBackend } from "../src/ios-backend-owned-runner.js";

describe("OwnedRunnerPhysicalBackend", () => {
	it("builds action and hierarchy command sentinels for experimental owned runner", () => {
		const backend = new OwnedRunnerPhysicalBackend();
		assert.equal(backend.backendId, "owned-runner");
		assert.equal(backend.supportLevel.tap, "partial");
		assert.equal(backend.supportLevel.hierarchy, "partial");
		assert.deepEqual(backend.buildTapCommand("device-1", 10, 20), [
			"__owned_runner__",
			"device-1",
			"tap",
			JSON.stringify({ x: 10, y: 20 }),
		]);
		assert.deepEqual(backend.buildHierarchyCaptureCommand("device-1"), [
			"__owned_runner_hierarchy__",
			"device-1",
		]);
		assert.equal(
			backend.buildScreenshotCommand("device-1", "/tmp/screen.png").length,
			0,
		);
	});
});
