import type { ReasonCode } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

export const OWNED_RUNNER_RESULT_PREFIX = "MOBILE_E2E_OWNED_RUNNER_RESULT=";

export type OwnedRunnerCommand =
	| {
			commandId: string;
			sessionId: string;
			action: "tap";
			targetAppId?: string;
			point: { x: number; y: number };
	  }
	| {
			commandId: string;
			sessionId: string;
			action: "type_text";
			targetAppId?: string;
			text: string;
	  }
	| {
			commandId: string;
			sessionId: string;
			action: "hierarchy";
			targetAppId?: string;
	  };

export interface OwnedRunnerResult {
	commandId: string;
	status: "success" | "partial" | "failed";
	reasonCode: ReasonCode;
	durationMs: number;
	data: Record<string, unknown>;
	artifacts: string[];
	message?: string;
}

const knownReasonCodes: ReadonlySet<string> = new Set(
	Object.values(REASON_CODES),
);

function isKnownReasonCode(value: unknown): value is ReasonCode {
	return typeof value === "string" && knownReasonCodes.has(value);
}

function buildInvalidOwnedRunnerResult(params: {
	commandId?: string;
	message: string;
}): OwnedRunnerResult {
	return {
		commandId: params.commandId ?? "unknown",
		status: "failed",
		reasonCode: REASON_CODES.adapterError,
		durationMs: 0,
		data: {},
		artifacts: [],
		message: params.message,
	};
}

export function buildOwnedRunnerCommandEnv(
	command: OwnedRunnerCommand,
): Record<string, string> {
	return {
		IOS_OWNED_RUNNER_COMMAND_ID: command.commandId,
		IOS_OWNED_RUNNER_SESSION_ID: command.sessionId,
		IOS_OWNED_RUNNER_COMMAND_JSON: JSON.stringify(command),
	};
}

export function buildLegacyOwnedRunnerActionEnv(
	command: OwnedRunnerCommand,
): Record<string, string> {
	if (command.action === "tap") {
		return {
			IOS_OWNED_RUNNER_ACTION_TYPE: "tap",
			...(command.targetAppId
				? { IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: command.targetAppId }
				: {}),
			IOS_OWNED_RUNNER_ACTION_X: String(command.point.x),
			IOS_OWNED_RUNNER_ACTION_Y: String(command.point.y),
		};
	}

	if (command.action === "type_text") {
		return {
			IOS_OWNED_RUNNER_ACTION_TYPE: "type_text",
			...(command.targetAppId
				? { IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: command.targetAppId }
				: {}),
			IOS_OWNED_RUNNER_ACTION_TEXT: command.text,
		};
	}

	return {
		IOS_OWNED_RUNNER_ACTION_TYPE: "hierarchy",
		...(command.targetAppId
			? { IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: command.targetAppId }
			: {}),
	};
}

function isOwnedRunnerResult(value: unknown): value is OwnedRunnerResult {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.commandId === "string" &&
		(candidate.status === "success" ||
			candidate.status === "partial" ||
			candidate.status === "failed") &&
		isKnownReasonCode(candidate.reasonCode) &&
		typeof candidate.durationMs === "number" &&
		Boolean(candidate.data && typeof candidate.data === "object") &&
		Array.isArray(candidate.artifacts)
	);
}

export function parseOwnedRunnerResultLine(
	line: string,
): OwnedRunnerResult | null {
	if (!line.startsWith(OWNED_RUNNER_RESULT_PREFIX)) {
		return null;
	}
	try {
		const parsed = JSON.parse(line.slice(OWNED_RUNNER_RESULT_PREFIX.length));
		if (isOwnedRunnerResult(parsed)) {
			return parsed;
		}
		const candidate =
			parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: {};
		const commandId =
			typeof candidate.commandId === "string" ? candidate.commandId : undefined;
		return buildInvalidOwnedRunnerResult({
			commandId,
			message:
				"Owned runner emitted a structured result with an invalid schema or unknown reasonCode.",
		});
	} catch {
		return buildInvalidOwnedRunnerResult({
			message: "Owned runner emitted malformed result JSON.",
		});
	}
}

export function parseOwnedRunnerResultFromStdout(
	stdout: string,
): OwnedRunnerResult | null {
	for (const line of stdout.split(/\r?\n/).reverse()) {
		const parsed = parseOwnedRunnerResultLine(line.trim());
		if (parsed) {
			return parsed;
		}
	}
	return null;
}
