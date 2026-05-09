import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { OWNED_RUNNER_RESULT_PREFIX } from "../src/ios-owned-runner-protocol.js";
import {
	resetExecuteRunnerForTesting,
	setExecuteRunnerForTesting,
} from "../src/runtime-shared.js";
import { executeIosPhysicalAction } from "../src/ui-action-tools-ios-physical.js";

test.afterEach(() => {
	resetExecuteRunnerForTesting();
});

test("executeIosPhysicalAction can force local owned runner and preserve runner success", async () => {
	let capturedCommand: string[] | undefined;
	let capturedEnv: NodeJS.ProcessEnv | undefined;
	setExecuteRunnerForTesting(async (command, _repoRoot, env) => {
		capturedCommand = command;
		capturedEnv = env;
		return {
			exitCode: 0,
			stdout: `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"session-1-tap","status":"success","reasonCode":"OK","durationMs":20,"data":{"action":"tap"},"artifacts":[]}`,
			stderr: "",
		};
	});

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "tap",
		flowContent:
			'appId: "com.example.app"\n---\n- tapOn:\n    point: "10,20"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.deepEqual(capturedCommand, [
		"bash",
		"scripts/dev/run-ios-owned-physical-runner.sh",
		"execute-flow",
	]);
	assert.equal(capturedEnv?.IOS_OWNED_RUNNER_ACTION_TYPE, "tap");
	assert.equal(capturedEnv?.IOS_OWNED_RUNNER_ACTION_X, "10");
	assert.equal(capturedEnv?.IOS_OWNED_RUNNER_ACTION_Y, "20");
	assert.equal(result.reasonCode, REASON_CODES.ok);
	assert.equal(result.executedBackend, "local_manual_runner");
	assert.equal(result.fallbackUsed, false);
});

test("executeIosPhysicalAction fails when forced owned runner omits structured result", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: "xcodebuild noise",
		stderr: "",
	}));

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "tap",
		flowContent:
			'appId: "com.example.app"\n---\n- tapOn:\n    point: "10,20"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.equal(result.reasonCode, REASON_CODES.adapterError);
	assert.equal(result.startupPhase, "missing_structured_result");
	assert.match(
		result.nextSuggestions.join("\n"),
		/structured owned-runner result/i,
	);
});

test("executeIosPhysicalAction preserves structured runner failure reason", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"session-1-type_text","status":"failed","reasonCode":"ACTION_TYPE_FAILED","durationMs":12,"data":{},"artifacts":[],"message":"typing failed"}`,
		stderr: "",
	}));

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "type_text",
		flowContent: 'appId: "com.example.app"\n---\n- inputText: "hello"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.equal(result.reasonCode, REASON_CODES.actionTypeFailed);
	assert.equal(result.startupPhase, "runner_reported_failure");
	assert.match(result.nextSuggestions.join("\n"), /typing failed/);
});

test("executeIosPhysicalAction rejects structured result commandId mismatch", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"other-session-tap","status":"success","reasonCode":"OK","durationMs":3,"data":{},"artifacts":[]}`,
		stderr: "",
	}));

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "tap",
		flowContent:
			'appId: "com.example.app"\n---\n- tapOn:\n    point: "10,20"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.equal(result.reasonCode, REASON_CODES.adapterError);
	assert.equal(result.startupPhase, "command_id_mismatch");
	assert.match(result.nextSuggestions.join("\n"), /expected session-1-tap/);
});

test("executeIosPhysicalAction derives structured failure from non-OK reasonCode", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"session-1-tap","status":"success","reasonCode":"ACTION_TAP_FAILED","durationMs":3,"data":{},"artifacts":[],"message":"tap failed despite success status"}`,
		stderr: "",
	}));

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "tap",
		flowContent:
			'appId: "com.example.app"\n---\n- tapOn:\n    point: "10,20"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.equal(result.reasonCode, REASON_CODES.actionTapFailed);
	assert.equal(result.startupPhase, "runner_reported_failure");
	assert.match(
		result.nextSuggestions.join("\n"),
		/tap failed despite success status/,
	);
});

test("executeIosPhysicalAction rejects structured OK when owned runner transport fails", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 74,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"session-1-tap","status":"success","reasonCode":"OK","durationMs":3,"data":{},"artifacts":[]}`,
		stderr: "xcodebuild failed",
	}));

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "tap",
		flowContent:
			'appId: "com.example.app"\n---\n- tapOn:\n    point: "10,20"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.equal(result.reasonCode, REASON_CODES.adapterError);
	assert.equal(result.startupPhase, "runner_transport_failed");
	assert.match(result.nextSuggestions.join("\n"), /exitCode 74/);
});

test("executeIosPhysicalAction rejects failed status with OK reasonCode", async () => {
	setExecuteRunnerForTesting(async () => ({
		exitCode: 0,
		stdout: `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"session-1-tap","status":"failed","reasonCode":"OK","durationMs":3,"data":{},"artifacts":[]}`,
		stderr: "",
	}));

	const result = await executeIosPhysicalAction({
		repoRoot: process.cwd(),
		deviceId: "device-1",
		sessionId: "session-1",
		actionType: "tap",
		flowContent:
			'appId: "com.example.app"\n---\n- tapOn:\n    point: "10,20"\n',
		forcedBackend: "local_manual_runner",
		requireStructuredOwnedRunnerResult: true,
	});

	assert.equal(result.reasonCode, REASON_CODES.adapterError);
	assert.equal(result.startupPhase, "status_reason_conflict");
	assert.match(result.nextSuggestions.join("\n"), /status failed with OK/);
});
