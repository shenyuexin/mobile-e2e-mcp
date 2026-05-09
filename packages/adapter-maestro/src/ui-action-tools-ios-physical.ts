import { ACTION_TYPES } from "@mobile-e2e-mcp/contracts";
/**
 * iOS physical action execution helpers for UI action tools.
 *
 * Extracted from ui-action-tools.ts to keep the main facade under control.
 * Handles local_manual_runner / maestro_cli backend selection, startup failure
 * classification, fallback execution, and evidence persistence.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReasonCode } from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { evidencePaths } from "./artifact-paths.js";
import {
	buildLegacyOwnedRunnerActionEnv,
	buildOwnedRunnerCommandEnv,
	type OwnedRunnerCommand,
	type OwnedRunnerResult,
	parseOwnedRunnerResultFromStdout,
} from "./ios-owned-runner-protocol.js";
import {
	buildFailureReason,
	executeRunnerWithTestHooks,
} from "./runtime-shared.js";
import type { IosPhysicalActionBackend } from "./ui-runtime-ios.js";
import {
	buildIosPhysicalActionExecutionPlan,
	buildIosPhysicalMaestroCommand,
} from "./ui-runtime-ios.js";

function normalizeAppId(value?: string): string | undefined {
	if (!value) {
		return undefined;
	}
	const trimmed = value.trim();
	if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function resolveOwnedRunnerTargetBundleId(params: {
	flowContent: string;
	targetAppId?: string;
}): string | undefined {
	const appIdMatch = params.flowContent.match(/^appId:\s*([^\r\n]+)/m);
	const flowAppId = normalizeAppId(appIdMatch?.[1]);
	const targetAppId = normalizeAppId(params.targetAppId) || flowAppId;
	return targetAppId && targetAppId !== "*" ? targetAppId : undefined;
}

function parseOwnedRunnerPoint(flowContent: string): { x: number; y: number } {
	const pointMatch = flowContent.match(
		/point\s*:\s*"?(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)"?/i,
	);
	if (pointMatch) {
		return {
			x: Number(pointMatch[1]),
			y: Number(pointMatch[2]),
		};
	}
	const xMatch = flowContent.match(/\bx\s*:\s*(-?\d+(?:\.\d+)?)/i);
	const yMatch = flowContent.match(/\by\s*:\s*(-?\d+(?:\.\d+)?)/i);
	return {
		x: xMatch ? Number(xMatch[1]) : 0,
		y: yMatch ? Number(yMatch[1]) : 0,
	};
}

function parseOwnedRunnerText(flowContent: string): string {
	const textMatch = flowContent.match(/-\s*inputText\s*:\s*"((?:\\"|[^"])*)"/i);
	return textMatch ? textMatch[1].replace(/\\"/g, '"') : "";
}

function buildOwnedRunnerCommand(params: {
	sessionId: string;
	actionType: "tap" | "type_text";
	flowContent: string;
	targetAppId?: string;
}): OwnedRunnerCommand {
	const commandId = `${params.sessionId}-${params.actionType}`;
	const targetAppId = resolveOwnedRunnerTargetBundleId(params);
	if (params.actionType === ACTION_TYPES.tap) {
		return {
			commandId,
			sessionId: params.sessionId,
			action: "tap",
			...(targetAppId ? { targetAppId } : {}),
			point: parseOwnedRunnerPoint(params.flowContent),
		};
	}
	return {
		commandId,
		sessionId: params.sessionId,
		action: "type_text",
		...(targetAppId ? { targetAppId } : {}),
		text: parseOwnedRunnerText(params.flowContent),
	};
}

export function buildIosPhysicalActionFlowPaths(
	repoRoot: string,
	sessionId: string,
	actionType: "tap" | "type_text",
): {
	relativePath: string;
	absolutePath: string;
} {
	const fileName = `${actionType}.maestro.yml`;
	const relativePath = path.posix.join(
		evidencePaths.iosPhysicalActions(),
		sessionId,
		fileName,
	);
	return {
		relativePath,
		absolutePath: path.resolve(repoRoot, relativePath),
	};
}

export function buildIosPhysicalExecutionEvidencePaths(
	repoRoot: string,
	sessionId: string,
	actionType: "tap" | "type_text",
): {
	relativePath: string;
	absolutePath: string;
} {
	const fileName = `${actionType}.execution.md`;
	const relativePath = path.posix.join(
		evidencePaths.iosPhysicalActions(),
		sessionId,
		fileName,
	);
	return {
		relativePath,
		absolutePath: path.resolve(repoRoot, relativePath),
	};
}

export function classifyIosPhysicalStartupFailure(params: {
	stderr: string;
	exitCode: number | null;
}): {
	reasonCode: ReasonCode;
	startupPhase:
		| "preflight"
		| "bundle_mapping"
		| "xctest_handshake"
		| "startup_timeout"
		| "runner_execution";
	summaryLine: string;
} {
	const stderrLower = params.stderr.toLowerCase();
	if (
		stderrLower.includes("device is locked") ||
		stderrLower.includes("device may be locked") ||
		stderrLower.includes("deviceprep") ||
		stderrLower.includes("code: -3")
	) {
		return {
			reasonCode: REASON_CODES.deviceUnavailable,
			startupPhase: "preflight",
			summaryLine:
				"Runner startup blocked during iOS preflight because target device is not ready/unlocked.",
		};
	}

	if (
		stderrLower.includes("failed to verify code signature") ||
		stderrLower.includes(
			"identity used to sign the executable is no longer valid",
		) ||
		stderrLower.includes("0xe8008018") ||
		stderrLower.includes("无法验证其完整性")
	) {
		return {
			reasonCode: REASON_CODES.configurationError,
			startupPhase: "preflight",
			summaryLine:
				"Runner installation failed during iOS preflight because the test-runner code signature could not be validated on device.",
		};
	}

	if (
		stderrLower.includes("testhostbundleidentifier") ||
		stderrLower.includes("bundle identifier") ||
		stderrLower.includes("xctrunner")
	) {
		return {
			reasonCode: REASON_CODES.configurationError,
			startupPhase: "bundle_mapping",
			summaryLine:
				"Runner startup failed due to xctestrun/TestHost bundle mapping or bundle identifier mismatch.",
		};
	}

	if (
		params.exitCode === 74 ||
		stderrLower.includes("dtxproxy") ||
		stderrLower.includes("xctestmanager_ideinterface") ||
		stderrLower.includes("channel canceled")
	) {
		return {
			reasonCode: REASON_CODES.adapterError,
			startupPhase: "xctest_handshake",
			summaryLine:
				"Runner exited before channel bootstrap completed (code74 / dtxproxy XCTestManager handshake failure).",
		};
	}

	if (stderrLower.includes("timed out") || stderrLower.includes("timeout")) {
		return {
			reasonCode: REASON_CODES.timeout,
			startupPhase: "startup_timeout",
			summaryLine:
				"Runner startup exceeded timeout before first actionable command channel became ready.",
		};
	}

	return {
		reasonCode: buildFailureReason(params.stderr, params.exitCode),
		startupPhase: "runner_execution",
		summaryLine:
			"Runner execution failed after startup dispatch; inspect stderr and execution evidence for root cause.",
	};
}

export function buildIosPhysicalFailureSuggestions(params: {
	reasonCode: ReasonCode;
	startupPhase: string;
	backend: IosPhysicalActionBackend;
	summaryLine: string;
}): string[] {
	if (
		params.reasonCode === REASON_CODES.configurationError &&
		params.startupPhase === "preflight"
	) {
		return [
			`${params.summaryLine} Ensure the runner and UITest targets are signed with a currently valid Apple Development identity and matching provisioning profile for the connected device UDID, then rebuild the xctestrun artifacts before retrying.`,
		];
	}

	if (params.backend === "local_manual_runner") {
		return [
			`${params.summaryLine} Verify manual-runner cache preparation, device unlock state, and xctestrun host bundle mapping before retrying.`,
		];
	}

	return [
		`${params.summaryLine} Verify --udid selection and iOS driver signing prerequisites (for example USE_XCODE_TEST_RUNNER / --apple-team-id) before retrying.`,
	];
}

export function buildOwnedRunnerActionEnv(params: {
	actionType: "tap" | "type_text";
	flowContent: string;
	targetAppId?: string;
}): Record<string, string> {
	const resolvedTargetBundleId = resolveOwnedRunnerTargetBundleId(params);
	if (params.actionType === ACTION_TYPES.tap) {
		const xMatch = params.flowContent.match(/\bx\s*:\s*(-?\d+(?:\.\d+)?)/i);
		const yMatch = params.flowContent.match(/\by\s*:\s*(-?\d+(?:\.\d+)?)/i);
		return {
			IOS_OWNED_RUNNER_ACTION_TYPE: "tap",
			...(resolvedTargetBundleId
				? { IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: resolvedTargetBundleId }
				: {}),
			...(xMatch ? { IOS_OWNED_RUNNER_ACTION_X: xMatch[1] } : {}),
			...(yMatch ? { IOS_OWNED_RUNNER_ACTION_Y: yMatch[1] } : {}),
		};
	}

	const textMatch = params.flowContent.match(
		/-\s*inputText\s*:\s*"((?:\\"|[^"])*)"/i,
	);
	const textValue = textMatch ? textMatch[1].replace(/\\"/g, '"') : "";
	return {
		IOS_OWNED_RUNNER_ACTION_TYPE: "type_text",
		...(resolvedTargetBundleId
			? { IOS_OWNED_RUNNER_TARGET_BUNDLE_ID: resolvedTargetBundleId }
			: {}),
		IOS_OWNED_RUNNER_ACTION_TEXT: textValue,
	};
}

function buildOwnedRunnerResultSuggestion(
	result: OwnedRunnerResult | null,
): string[] {
	if (!result) {
		return [
			"Owned iOS runner transport completed without a structured owned-runner result. Verify the XCTest runner emits MOBILE_E2E_OWNED_RUNNER_RESULT before trusting action outcome.",
		];
	}
	if (result.message) {
		return [result.message];
	}
	return [
		"Owned iOS runner reported action failure. Inspect execution evidence for the native XCTest error context.",
	];
}

export async function persistIosPhysicalExecutionEvidence(params: {
	repoRoot: string;
	sessionId: string;
	actionType: "tap" | "type_text";
	attemptedBackend: IosPhysicalActionBackend;
	executedBackend: IosPhysicalActionBackend;
	fallbackUsed: boolean;
	primaryFailurePhase?: string;
	primaryFailureSummary?: string;
	startupPhase: string;
	summaryLine: string;
	reasonCode: ReasonCode;
	command: string[];
	exitCode: number | null;
}): Promise<string> {
	const evidencePaths = buildIosPhysicalExecutionEvidencePaths(
		params.repoRoot,
		params.sessionId,
		params.actionType,
	);
	await mkdir(path.dirname(evidencePaths.absolutePath), { recursive: true });
	const content = [
		`# iOS physical ${params.actionType} execution evidence`,
		"",
		`- attemptedBackend: ${params.attemptedBackend}`,
		`- executedBackend: ${params.executedBackend}`,
		`- fallbackUsed: ${String(params.fallbackUsed)}`,
		params.primaryFailurePhase
			? `- primaryFailurePhase: ${params.primaryFailurePhase}`
			: "- primaryFailurePhase: none",
		params.primaryFailureSummary
			? `- primaryFailureSummary: ${params.primaryFailureSummary}`
			: "- primaryFailureSummary: none",
		`- startupPhase: ${params.startupPhase}`,
		`- reasonCode: ${params.reasonCode}`,
		`- exitCode: ${String(params.exitCode)}`,
		"",
		`## Summary`,
		params.summaryLine,
		"",
		"## Command",
		"```bash",
		params.command
			.map((segment) => (segment.includes(" ") ? `"${segment}"` : segment))
			.join(" "),
		"```",
		"",
	].join("\n");
	await writeFile(evidencePaths.absolutePath, content, "utf8");
	return evidencePaths.relativePath;
}

export async function executeIosPhysicalAction(params: {
	repoRoot: string;
	deviceId: string;
	sessionId: string;
	actionType: "tap" | "type_text";
	flowContent: string;
	targetAppId?: string;
	forcedBackend?: IosPhysicalActionBackend;
	requireStructuredOwnedRunnerResult?: boolean;
}): Promise<{
	command: string[];
	attemptedBackend: IosPhysicalActionBackend;
	executedBackend: IosPhysicalActionBackend;
	fallbackUsed: boolean;
	startupPhase: string;
	exitCode: number | null;
	reasonCode: ReasonCode;
	nextSuggestions: string[];
	artifacts: string[];
}> {
	const flowPaths = buildIosPhysicalActionFlowPaths(
		params.repoRoot,
		params.sessionId,
		params.actionType,
	);
	await mkdir(path.dirname(flowPaths.absolutePath), { recursive: true });
	await writeFile(flowPaths.absolutePath, params.flowContent, "utf8");
	const executionPlan = buildIosPhysicalActionExecutionPlan(
		params.deviceId,
		flowPaths.relativePath,
		params.forcedBackend
			? { ...process.env, IOS_PHYSICAL_ACTION_BACKEND: params.forcedBackend }
			: process.env,
	);
	const ownedRunnerCommand = buildOwnedRunnerCommand({
		sessionId: params.sessionId,
		actionType: params.actionType,
		flowContent: params.flowContent,
		targetAppId: params.targetAppId,
	});
	const ownedRunnerActionEnv =
		executionPlan.backend === "local_manual_runner"
			? {
					...buildOwnedRunnerCommandEnv(ownedRunnerCommand),
					...buildLegacyOwnedRunnerActionEnv(ownedRunnerCommand),
				}
			: {};
	const executionEnv = {
		...process.env,
		...executionPlan.envPatch,
		...ownedRunnerActionEnv,
	};
	const execution = await executeRunnerWithTestHooks(
		executionPlan.command,
		params.repoRoot,
		executionEnv,
	);

	if (
		executionPlan.backend === "local_manual_runner" &&
		params.requireStructuredOwnedRunnerResult
	) {
		const parsedRunnerResult = parseOwnedRunnerResultFromStdout(
			execution.stdout,
		);
		const commandIdMismatch = parsedRunnerResult
			? parsedRunnerResult.commandId !== ownedRunnerCommand.commandId
			: false;
		const runnerResult =
			parsedRunnerResult && commandIdMismatch
				? {
						...parsedRunnerResult,
						status: "failed" as const,
						reasonCode: REASON_CODES.adapterError,
						message: `Owned runner emitted result for commandId ${parsedRunnerResult.commandId}; expected ${ownedRunnerCommand.commandId}.`,
					}
				: parsedRunnerResult;
		const transportFailed = execution.exitCode !== 0;
		const statusReasonConflict =
			runnerResult?.reasonCode === REASON_CODES.ok &&
			runnerResult.status !== "success";
		const structuredReasonCode = transportFailed
			? REASON_CODES.adapterError
			: statusReasonConflict
				? REASON_CODES.adapterError
				: (runnerResult?.reasonCode ?? REASON_CODES.adapterError);
		const structuredOk =
			execution.exitCode === 0 &&
			runnerResult?.status === "success" &&
			structuredReasonCode === REASON_CODES.ok;
		const structuredStartupPhase = runnerResult
			? commandIdMismatch
				? "command_id_mismatch"
				: transportFailed
					? "runner_transport_failed"
					: statusReasonConflict
						? "status_reason_conflict"
						: structuredOk
							? "ok"
							: "runner_reported_failure"
			: "missing_structured_result";
		const structuredRunnerResult = transportFailed
			? runnerResult
				? {
						...runnerResult,
						status: "failed" as const,
						reasonCode: REASON_CODES.adapterError,
						message:
							runnerResult.message ??
							`Owned runner transport failed with exitCode ${execution.exitCode}; ignoring structured success claims.`,
					}
				: null
			: statusReasonConflict && runnerResult
				? {
						...runnerResult,
						status: "failed" as const,
						reasonCode: REASON_CODES.adapterError,
						message:
							runnerResult.message ??
							`Owned runner reported status ${runnerResult.status} with OK reasonCode; treating as adapter error.`,
					}
				: runnerResult;
		const structuredSummaryLine = structuredRunnerResult
			? `iOS physical action completed via local_manual_runner with structured status ${structuredRunnerResult.status} and reasonCode ${structuredReasonCode}.`
			: "iOS physical action completed without a structured owned-runner result.";
		const evidenceArtifact = await persistIosPhysicalExecutionEvidence({
			repoRoot: params.repoRoot,
			sessionId: params.sessionId,
			actionType: params.actionType,
			attemptedBackend: executionPlan.backend,
			executedBackend: executionPlan.backend,
			fallbackUsed: false,
			startupPhase: structuredStartupPhase,
			summaryLine: structuredSummaryLine,
			reasonCode: structuredReasonCode,
			command: executionPlan.command,
			exitCode: execution.exitCode,
		});
		return {
			command: executionPlan.command,
			attemptedBackend: executionPlan.backend,
			executedBackend: executionPlan.backend,
			fallbackUsed: false,
			startupPhase: structuredStartupPhase,
			exitCode: execution.exitCode,
			reasonCode: structuredReasonCode,
			nextSuggestions: structuredOk
				? []
				: buildOwnedRunnerResultSuggestion(structuredRunnerResult),
			artifacts: [
				flowPaths.relativePath,
				evidenceArtifact,
				...(structuredRunnerResult?.artifacts ?? []),
			],
		};
	}

	if (
		executionPlan.backend === "local_manual_runner" &&
		execution.exitCode !== 0
	) {
		const primaryFailure = classifyIosPhysicalStartupFailure({
			stderr: execution.stderr,
			exitCode: execution.exitCode,
		});
		const fallbackCommand = buildIosPhysicalMaestroCommand(
			params.deviceId,
			flowPaths.relativePath,
		);
		const fallbackExecution = await executeRunnerWithTestHooks(
			fallbackCommand,
			params.repoRoot,
			process.env,
		);
		const fallbackFailure = classifyIosPhysicalStartupFailure({
			stderr: fallbackExecution.stderr,
			exitCode: fallbackExecution.exitCode,
		});
		const fallbackReasonCode =
			fallbackExecution.exitCode === 0
				? REASON_CODES.ok
				: fallbackFailure.reasonCode;
		const fallbackStartupPhase =
			fallbackExecution.exitCode === 0
				? "maestro_fallback_success"
				: fallbackFailure.startupPhase;
		const fallbackSummaryLine =
			fallbackExecution.exitCode === 0
				? "Local manual-runner failed, but explicit Maestro fallback succeeded for this action."
				: fallbackFailure.summaryLine;
		const evidenceArtifact = await persistIosPhysicalExecutionEvidence({
			repoRoot: params.repoRoot,
			sessionId: params.sessionId,
			actionType: params.actionType,
			attemptedBackend: executionPlan.backend,
			executedBackend: "maestro_cli",
			fallbackUsed: true,
			primaryFailurePhase: primaryFailure.startupPhase,
			primaryFailureSummary: primaryFailure.summaryLine,
			startupPhase: fallbackStartupPhase,
			summaryLine: fallbackSummaryLine,
			reasonCode: fallbackReasonCode,
			command: fallbackCommand,
			exitCode: fallbackExecution.exitCode,
		});
		const fallbackSuggestions =
			fallbackExecution.exitCode === 0
				? [
						"iOS physical action succeeded through explicit Maestro fallback after local manual-runner startup failure.",
					]
				: buildIosPhysicalFailureSuggestions({
						reasonCode: fallbackReasonCode,
						startupPhase: fallbackStartupPhase,
						backend: "maestro_cli",
						summaryLine: `Both local iOS manual-runner backend and explicit Maestro fallback failed (${fallbackSummaryLine}).`,
					});
		return {
			command: fallbackCommand,
			attemptedBackend: executionPlan.backend,
			executedBackend: "maestro_cli",
			fallbackUsed: true,
			startupPhase: fallbackStartupPhase,
			exitCode: fallbackExecution.exitCode,
			reasonCode: fallbackReasonCode,
			nextSuggestions: fallbackSuggestions,
			artifacts: [flowPaths.relativePath, evidenceArtifact],
		};
	}

	const startupFailure = classifyIosPhysicalStartupFailure({
		stderr: execution.stderr,
		exitCode: execution.exitCode,
	});
	const reasonCode =
		execution.exitCode === 0 ? REASON_CODES.ok : startupFailure.reasonCode;
	const startupPhase =
		execution.exitCode === 0 ? "ok" : startupFailure.startupPhase;
	const summaryLine =
		execution.exitCode === 0
			? `iOS physical action executed successfully via ${executionPlan.backend}.`
			: startupFailure.summaryLine;
	const evidenceArtifact = await persistIosPhysicalExecutionEvidence({
		repoRoot: params.repoRoot,
		sessionId: params.sessionId,
		actionType: params.actionType,
		attemptedBackend: executionPlan.backend,
		executedBackend: executionPlan.backend,
		fallbackUsed: false,
		startupPhase,
		summaryLine,
		reasonCode,
		command: executionPlan.command,
		exitCode: execution.exitCode,
	});
	const nextSuggestions =
		execution.exitCode === 0
			? []
			: buildIosPhysicalFailureSuggestions({
					reasonCode,
					startupPhase,
					backend: executionPlan.backend,
					summaryLine,
				});
	return {
		command: executionPlan.command,
		attemptedBackend: executionPlan.backend,
		executedBackend: executionPlan.backend,
		fallbackUsed: false,
		startupPhase,
		exitCode: execution.exitCode,
		reasonCode,
		nextSuggestions,
		artifacts: [flowPaths.relativePath, evidenceArtifact],
	};
}
