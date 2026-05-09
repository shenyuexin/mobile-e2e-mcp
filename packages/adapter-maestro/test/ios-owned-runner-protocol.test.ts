import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildLegacyOwnedRunnerActionEnv,
	buildOwnedRunnerCommandEnv,
	OWNED_RUNNER_RESULT_PREFIX,
	parseOwnedRunnerResultFromStdout,
	parseOwnedRunnerResultLine,
} from "../src/ios-owned-runner-protocol.js";

describe("ios-owned-runner-protocol", () => {
	it("serializes tap commands into stable JSON and legacy env variables", () => {
		const command = {
			commandId: "cmd-1",
			sessionId: "session-1",
			action: "tap" as const,
			targetAppId: "com.example.app",
			point: { x: 12, y: 34 },
		};

		const env = buildOwnedRunnerCommandEnv(command);
		assert.equal(env.IOS_OWNED_RUNNER_COMMAND_ID, "cmd-1");
		assert.equal(env.IOS_OWNED_RUNNER_SESSION_ID, "session-1");
		assert.deepEqual(JSON.parse(env.IOS_OWNED_RUNNER_COMMAND_JSON), command);

		assert.deepEqual(buildLegacyOwnedRunnerActionEnv(command), {
			IOS_OWNED_RUNNER_ACTION_TYPE: "tap",
			IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: "com.example.app",
			IOS_OWNED_RUNNER_ACTION_X: "12",
			IOS_OWNED_RUNNER_ACTION_Y: "34",
		});
	});

	it("serializes type_text commands into stable JSON and legacy env variables", () => {
		const command = {
			commandId: "cmd-2",
			sessionId: "session-1",
			action: "type_text" as const,
			targetAppId: "com.example.app",
			text: "hello",
		};

		assert.deepEqual(buildLegacyOwnedRunnerActionEnv(command), {
			IOS_OWNED_RUNNER_ACTION_TYPE: "type_text",
			IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: "com.example.app",
			IOS_OWNED_RUNNER_ACTION_TEXT: "hello",
		});
	});

	it("parses the last structured result from noisy stdout", () => {
		const resultLine = `${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"cmd-1","status":"success","reasonCode":"OK","durationMs":15,"data":{"tapped":true},"artifacts":[]}`;

		assert.deepEqual(
			parseOwnedRunnerResultFromStdout(`noise\n${resultLine}\n`),
			{
				commandId: "cmd-1",
				status: "success",
				reasonCode: "OK",
				durationMs: 15,
				data: { tapped: true },
				artifacts: [],
			},
		);
	});

	it("returns null for non-result stdout lines", () => {
		assert.equal(parseOwnedRunnerResultLine("xcodebuild log noise"), null);
	});

	it("turns malformed result JSON into an adapter error result", () => {
		const parsed = parseOwnedRunnerResultLine(
			`${OWNED_RUNNER_RESULT_PREFIX}{not-json`,
		);
		assert.equal(parsed?.status, "failed");
		assert.equal(parsed?.reasonCode, "ADAPTER_ERROR");
	});

	it("turns unknown reasonCode into an adapter error result", () => {
		const parsed = parseOwnedRunnerResultLine(
			`${OWNED_RUNNER_RESULT_PREFIX}{"commandId":"cmd-3","status":"success","reasonCode":"MADE_UP_REASON","durationMs":1,"data":{},"artifacts":[]}`,
		);

		assert.equal(parsed?.commandId, "cmd-3");
		assert.equal(parsed?.status, "failed");
		assert.equal(parsed?.reasonCode, "ADAPTER_ERROR");
		assert.match(parsed?.message ?? "", /unknown reasonCode/i);
	});
});
