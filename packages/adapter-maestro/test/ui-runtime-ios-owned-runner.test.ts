import assert from "node:assert/strict";
import test from "node:test";
import { OWNED_RUNNER_RESULT_PREFIX } from "../src/ios-owned-runner-protocol.js";
import {
	resetExecuteRunnerForTesting,
	setExecuteRunnerForTesting,
} from "../src/runtime-shared.js";
import { uiRuntimeInternals } from "../src/ui-runtime.js";

test.afterEach(() => {
	resetExecuteRunnerForTesting();
});

test("executeUiActionCommand fails owned-runner unsupported hierarchy sentinel honestly", async () => {
	const result = await uiRuntimeInternals.executeUiActionCommand({
		repoRoot: process.cwd(),
		command: ["__owned_runner_unsupported__", "device-1", "hierarchy"],
		requiresProbe: false,
	});

	assert.equal(result.execution?.exitCode, 1);
	assert.match(
		result.execution?.stderr ?? "",
		/Owned runner backend does not yet support hierarchy/,
	);
});

test("executeUiActionCommand maps owned-runner hierarchy result to inspectable stdout", async () => {
	const hierarchy = {
		type: "Application",
		identifier: "com.example.demo",
		AXLabel: "Demo",
		title: null,
		AXValue: null,
		frame: { x: 0, y: 0, width: 390, height: 844 },
		enabled: true,
		custom_actions: [],
		children: [
			{
				type: "Button",
				identifier: "continue_button",
				AXLabel: "Continue",
				title: "Continue",
				AXValue: null,
				frame: { x: 20, y: 100, width: 120, height: 44 },
				enabled: true,
				custom_actions: ["default"],
				children: [],
			},
		],
	};
	let capturedEnv: NodeJS.ProcessEnv | undefined;
	setExecuteRunnerForTesting(async (_command, _repoRoot, env) => {
		capturedEnv = env;
		return {
			exitCode: 0,
			stdout: `${OWNED_RUNNER_RESULT_PREFIX}${JSON.stringify({
				commandId: "device-1-hierarchy",
				status: "success",
				reasonCode: "OK",
				durationMs: 7,
				data: { action: "hierarchy", hierarchyJson: JSON.stringify(hierarchy) },
				artifacts: [],
			})}`,
			stderr: "",
		};
	});

	const result = await uiRuntimeInternals.executeUiActionCommand({
		repoRoot: process.cwd(),
		command: ["__owned_runner_hierarchy__", "device-1"],
		requiresProbe: false,
	});

	assert.equal(capturedEnv?.IOS_OWNED_RUNNER_ACTION_TYPE, "hierarchy");
	assert.equal(capturedEnv?.IOS_OWNED_RUNNER_COMMAND_ID, "device-1-hierarchy");
	assert.equal(result.execution?.exitCode, 0);
	assert.deepEqual(JSON.parse(result.execution?.stdout ?? "{}"), hierarchy);
});

test("executeUiActionCommand rejects owned-runner hierarchy OK result when transport exits nonzero", async () => {
	const hierarchy = {
		type: "Application",
		frame: { x: 0, y: 0, width: 390, height: 844 },
		enabled: true,
		custom_actions: [],
		children: [],
	};
	setExecuteRunnerForTesting(async () => ({
		exitCode: 74,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}${JSON.stringify({
			commandId: "device-1-hierarchy",
			status: "success",
			reasonCode: "OK",
			durationMs: 7,
			data: { action: "hierarchy", hierarchyJson: JSON.stringify(hierarchy) },
			artifacts: [],
		})}`,
		stderr: "xcodebuild failed",
	}));

	const result = await uiRuntimeInternals.executeUiActionCommand({
		repoRoot: process.cwd(),
		command: ["__owned_runner_hierarchy__", "device-1"],
		requiresProbe: false,
	});

	assert.equal(result.execution?.exitCode, 1);
	assert.match(result.execution?.stderr ?? "", /transport failed|exitCode 74/);
});

test("executeUiActionCommand rejects owned-runner hierarchy status conflict and malformed payload", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}${JSON.stringify({
			commandId: "device-1-hierarchy",
			status: "failed",
			reasonCode: "OK",
			durationMs: 7,
			data: { action: "hierarchy", hierarchyJson: "not-json" },
			artifacts: [],
			message: "conflicting status",
		})}`,
		stderr: "",
	}));

	const result = await uiRuntimeInternals.executeUiActionCommand({
		repoRoot: process.cwd(),
		command: ["__owned_runner_hierarchy__", "device-1"],
		requiresProbe: false,
	});

	assert.equal(result.execution?.exitCode, 1);
	assert.match(result.execution?.stderr ?? "", /conflicting status/);
});

test("executeUiActionCommand rejects owned-runner hierarchy empty or unparseable hierarchyJson", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}${JSON.stringify({
			commandId: "device-1-hierarchy",
			status: "success",
			reasonCode: "OK",
			durationMs: 7,
			data: { action: "hierarchy", hierarchyJson: "not-json" },
			artifacts: [],
		})}`,
		stderr: "",
	}));

	const result = await uiRuntimeInternals.executeUiActionCommand({
		repoRoot: process.cwd(),
		command: ["__owned_runner_hierarchy__", "device-1"],
		requiresProbe: false,
	});

	assert.equal(result.execution?.exitCode, 1);
	assert.match(result.execution?.stderr ?? "", /empty or unparseable/);
});
