import type { InspectUiNode } from "@mobile-e2e-mcp/contracts";
import { ACTION_TYPES, REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { CLI_COMMANDS } from "./constants/cli-commands.js";
import { getIosBackendRouter } from "./ios-backend-router.js";
import { isIosSimulatorUdid, parseAppleKeyboardsOutput } from "./ios-simulator-env.js";
import { buildFailureReason, executeRunnerWithTestHooks } from "./runtime-shared.js";
import {
	buildIosNativeLocatorCandidate,
	extractIosEditableNodeValue,
	isIosEditableNode,
	parseIosInspectNodes,
	parseUiBounds,
} from "./ui-model.js";
import { executeUiActionCommand } from "./ui-runtime.js";
import type {
	UiKeyboardStateProbe,
	UiKeyboardVisibility,
	UiResolvedPointVerificationParams,
	UiResolvedPointVerificationResult,
	UiRuntimePlatformHooks,
	UiRuntimeProbeAction,
	UiTypedPostconditionVerificationParams,
} from "./ui-runtime-platform.js";

/**
 * Find all nodes whose bounds contain the given point, ordered from
 * smallest area (deepest/most specific child) to largest area (parent container).
 */
function findNodesAtPoint(
	nodes: InspectUiNode[],
	point: { x: number; y: number },
): InspectUiNode[] {
	const matchingWithArea: Array<{ node: InspectUiNode; area: number }> = [];
	for (const node of nodes) {
		if (!node.bounds) continue;
		const bounds = parseUiBounds(node.bounds);
		if (!bounds) continue;
		if (
			point.x >= bounds.left &&
			point.x <= bounds.right &&
			point.y >= bounds.top &&
			point.y <= bounds.bottom
		) {
			matchingWithArea.push({
				node,
				area: bounds.width * bounds.height,
			});
		}
	}
	matchingWithArea.sort((a, b) => a.area - b.area);
	return matchingWithArea.map((entry) => entry.node);
}

function findNodeAtPoint(
	nodes: InspectUiNode[],
	point: { x: number; y: number },
): InspectUiNode | undefined {
	return findNodesAtPoint(nodes, point)[0];
}

function matchesExpectedIosLocator(
	candidate: ReturnType<typeof buildIosNativeLocatorCandidate>,
	expected: NonNullable<ReturnType<typeof buildIosNativeLocatorCandidate>>,
): boolean {
	return (
		candidate?.kind === expected.kind &&
		candidate.value === expected.value &&
		candidate.text === expected.text &&
		candidate.contentDesc === expected.contentDesc &&
		candidate.className === expected.className
	);
}

function escapeYamlDoubleQuoted(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("\n", "\\n");
}

export function buildIosPhysicalTapFlowYaml(x: number, y: number): string {
	return [
		'appId: "*"',
		"---",
		"- tapOn:",
		`    point: "${String(x)},${String(y)}"`,
		"",
	].join("\n");
}

export function buildIosPhysicalTypeTextFlowYaml(text: string): string {
	return [
		'appId: "*"',
		"---",
		`- inputText: "${escapeYamlDoubleQuoted(text)}"`,
		"",
	].join("\n");
}

export function buildIosPhysicalMaestroCommand(
	deviceId: string,
	flowPath: string,
): string[] {
	return ["maestro", "test", "--platform", "ios", "--udid", deviceId, flowPath];
}

export type IosPhysicalActionBackend = "maestro_cli" | "local_manual_runner";

export interface IosPhysicalActionExecutionPlan {
	backend: IosPhysicalActionBackend;
	command: string[];
	envPatch: Record<string, string>;
}

export function resolveIosPhysicalActionBackend(
	env: NodeJS.ProcessEnv = process.env,
): IosPhysicalActionBackend {
	const configured = env.IOS_PHYSICAL_ACTION_BACKEND?.trim().toLowerCase();
	if (configured === "local_manual_runner") {
		return "local_manual_runner";
	}
	return "maestro_cli";
}

export function buildIosPhysicalActionExecutionPlan(
	deviceId: string,
	flowPath: string,
	env: NodeJS.ProcessEnv = process.env,
): IosPhysicalActionExecutionPlan {
	const backend = resolveIosPhysicalActionBackend(env);
	if (backend === "local_manual_runner") {
		return {
			backend,
			command: [
				"bash",
				"scripts/dev/run-ios-owned-physical-runner.sh",
				"execute-flow",
			],
			envPatch: {
				IOS_OWNED_RUNNER_UDID: deviceId,
				IOS_OWNED_RUNNER_FLOW_PATH: flowPath,
			},
		};
	}
	return {
		backend,
		command: buildIosPhysicalMaestroCommand(deviceId, flowPath),
		envPatch: {},
	};
}

function buildProbeSuggestion(action: UiRuntimeProbeAction): string {
	if (action === "inspect_ui") {
		return "iOS inspect_ui uses xcrun simctl (simulators) or devicectl+Maestro (physical devices). Run 'mobile-e2e-mcp doctor' to verify backend availability.";
	}
	if (action === ACTION_TYPES.tap) {
		return "iOS tap uses xcrun simctl io tap (simulators) or WDA/Maestro-backed physical execution by default. Set IOS_PHYSICAL_ACTION_BACKEND=local_manual_runner for experimental owned-runner tap trials.";
	}
	return "iOS type_text uses xcrun simctl keyboard type (simulators) or WDA/Maestro-backed physical execution by default. Set IOS_PHYSICAL_ACTION_BACKEND=local_manual_runner for experimental owned-runner text trials.";
}

export function isIosSimulatorOnlyIdbActionError(stderr: string): boolean {
	return stderr.toLowerCase().includes("fbsimulatorlifecyclecommands protocol");
}

export async function verifyResolvedIosPointWithHooks(
	params: UiResolvedPointVerificationParams & {
		executeDescribePointCommand?: typeof executeUiActionCommand;
	},
): Promise<UiResolvedPointVerificationResult> {
	const expected = buildIosNativeLocatorCandidate(
		params.resolvedNode,
		params.resolvedQuery,
	);
	const command =
		params.runtimeHooks.buildDescribePointCommand?.(
			params.deviceId,
			params.resolvedPoint.x,
			params.resolvedPoint.y,
		) ?? [];
	if (!expected || command.length === 0) {
		return { verified: false, command, exitCode: null };
	}

	const executeDescribePoint =
		params.executeDescribePointCommand ?? executeUiActionCommand;
	const actionResult = await executeDescribePoint({
		repoRoot: params.repoRoot,
		command,
		requiresProbe: params.runtimeHooks.requiresProbe,
		probeRuntimeAvailability: params.runtimeHooks.probeRuntimeAvailability,
	});
	if (!actionResult.execution) {
		return {
			verified: false,
			command,
			exitCode: actionResult.probeExecution?.exitCode ?? null,
			reasonCode: params.runtimeHooks.probeFailureReasonCode,
		};
	}
	if (actionResult.execution.exitCode !== 0) {
		return {
			verified: false,
			command,
			exitCode: actionResult.execution.exitCode,
			reasonCode: buildFailureReason(
				actionResult.execution.stderr,
				actionResult.execution.exitCode,
			),
		};
	}

	const allNodes = parseIosInspectNodes(actionResult.execution.stdout);
	const nodesAtPoint = findNodesAtPoint(allNodes, params.resolvedPoint);
	let verified = false;
	if (nodesAtPoint.length > 0) {
		for (const node of nodesAtPoint) {
			const candidate = buildIosNativeLocatorCandidate(
				node,
				params.resolvedQuery,
			);
			if (matchesExpectedIosLocator(candidate, expected)) {
				verified = true;
				break;
			}
			// Occlusion safety guard: if a smaller node covering the target point
			// owns a different explicit identifier, stop walking up to ancestors.
			if (
				expected.kind === "identifier" &&
				node.resourceId &&
				node.resourceId !== expected.value
			) {
				break;
			}
		}
	} else {
		const fallbackCandidate = buildIosNativeLocatorCandidate(
			allNodes[0],
			params.resolvedQuery,
		);
		verified = matchesExpectedIosLocator(fallbackCandidate, expected);
	}

	// If the tap succeeded (exitCode 0) but the node doesn't match, the screen likely
	// changed due to navigation. Report it as not verified so the caller can decide
	// based on full state comparison rather than silently masking the mismatch.
	if (!verified && actionResult.execution.exitCode === 0) {
		return {
			verified: false,
			command,
			exitCode: actionResult.execution.exitCode,
			reasonCode: REASON_CODES.noMatch,
		};
	}

	return {
		verified,
		command,
		exitCode: actionResult.execution.exitCode,
		reasonCode: verified ? REASON_CODES.ok : REASON_CODES.noMatch,
	};
}

export const DEFAULT_IOS_FOCUS_SETTLE_DELAY_MS = 350;

export function detectIosImeInputMismatch(
	expected: string,
	observed: string | undefined,
): string | undefined {
	if (!observed) {
		return undefined;
	}
	if (observed.includes("\u2006")) {
		return `Observed typed value ${JSON.stringify(observed)} contains Apple Pinyin candidate separator (\\u2006) instead of ${JSON.stringify(expected)}. Check '-g AppleKeyboards' with 'mobile-e2e-mcp doctor' and ensure an English keyboard is first.`;
	}
	const expectedIsAscii = /^[\x20-\x7e]+$/.test(expected);
	const observedHasNonAscii = /[^\x20-\x7e]/.test(observed);
	if (expectedIsAscii && observedHasNonAscii) {
		return `Observed typed value ${JSON.stringify(observed)} contains non-ASCII IME characters instead of expected ASCII ${JSON.stringify(expected)}. Run 'mobile-e2e-mcp doctor' to check simulator AppleKeyboards.`;
	}
	return undefined;
}

export async function verifyTypedIosPostconditionWithHooks(
	params: UiTypedPostconditionVerificationParams & {
		executeDescribePointCommand?: typeof executeUiActionCommand;
	},
): Promise<UiResolvedPointVerificationResult> {
	const baseVerification = await verifyResolvedIosPointWithHooks(params);
	if (!baseVerification.verified) {
		return baseVerification;
	}

	const executeDescribePoint =
		params.executeDescribePointCommand ?? executeUiActionCommand;
	const actionResult = await executeDescribePoint({
		repoRoot: params.repoRoot,
		command: baseVerification.command,
		requiresProbe: params.runtimeHooks.requiresProbe,
		probeRuntimeAvailability: params.runtimeHooks.probeRuntimeAvailability,
	});
	if (!actionResult.execution) {
		return {
			verified: false,
			command: baseVerification.command,
			exitCode: actionResult.probeExecution?.exitCode ?? null,
			reasonCode: params.runtimeHooks.probeFailureReasonCode,
		};
	}
	if (actionResult.execution.exitCode !== 0) {
		return {
			verified: false,
			command: baseVerification.command,
			exitCode: actionResult.execution.exitCode,
			reasonCode: buildFailureReason(
				actionResult.execution.stderr,
				actionResult.execution.exitCode,
			),
		};
	}

	// Bug fix: Use findNodeAtPoint instead of nodes[0] to get the actual element at the resolved coordinates.
	// The first node is always the Application root, which has no editable value.
	const allNodes = parseIosInspectNodes(actionResult.execution.stdout);
	const pointNode =
		findNodeAtPoint(allNodes, params.resolvedPoint) ?? allNodes[0];
	const actual = buildIosNativeLocatorCandidate(
		pointNode,
		params.resolvedQuery,
	);
	const expected = buildIosNativeLocatorCandidate(
		params.resolvedNode,
		params.resolvedQuery,
	);
	if (
		!actual ||
		!expected ||
		actual.kind !== expected.kind ||
		actual.value !== expected.value ||
		actual.text !== expected.text ||
		actual.contentDesc !== expected.contentDesc ||
		actual.className !== expected.className
	) {
		return {
			verified: false,
			command: baseVerification.command,
			exitCode: actionResult.execution.exitCode,
			reasonCode: REASON_CODES.noMatch,
		};
	}
	if (
		isIosEditableNode(params.resolvedNode) &&
		params.resolvedNode.className?.toLowerCase() !== "securetextfield"
	) {
		const observedValue = extractIosEditableNodeValue(pointNode);
		if (observedValue !== params.typedValue) {
			return {
				verified: false,
				command: baseVerification.command,
				exitCode: actionResult.execution.exitCode,
				reasonCode: REASON_CODES.actionTypeFailed,
				diagnosticHint: detectIosImeInputMismatch(
					params.typedValue,
					observedValue,
				),
			};
		}
	}

	return {
		verified: true,
		command: baseVerification.command,
		exitCode: actionResult.execution.exitCode,
		reasonCode: REASON_CODES.ok,
	};
}

const IOS_KEYBOARD_PROBE_TIMEOUT_MS = 3000;
const IOS_APPLE_KEYBOARDS_TIMEOUT_MS = 1500;

export function classifyIosKeyboardStateFromNodes(
	nodes: InspectUiNode[],
	primaryKeyboard?: string,
): { visibility: UiKeyboardVisibility; reason: string; imeType?: string } {
	if (nodes.length === 0) {
		return {
			visibility: "unknown",
			reason: "ios_keyboard_hierarchy_unavailable",
			...(primaryKeyboard ? { imeType: primaryKeyboard } : {}),
		};
	}

	const hasKeyboardNode = nodes.some((node) => {
		const classLower = (node.className ?? "").toLowerCase();
		if (classLower.includes("keyboard")) {
			return true;
		}
		const labelLower = (node.text ?? node.contentDesc ?? "").trim().toLowerCase();
		return (
			labelLower === "next keyboard" ||
			labelLower === "dismiss keyboard" ||
			labelLower === "dictation" ||
			labelLower === "emoji"
		);
	});

	if (hasKeyboardNode) {
		return {
			visibility: "visible",
			reason: "ios_keyboard_hierarchy_visible",
			...(primaryKeyboard ? { imeType: primaryKeyboard } : {}),
		};
	}

	return {
		visibility: "hidden",
		reason: "ios_keyboard_hierarchy_hidden",
		...(primaryKeyboard ? { imeType: primaryKeyboard } : {}),
	};
}

export async function probeIosKeyboardState(params: {
	repoRoot: string;
	deviceId: string;
}): Promise<UiKeyboardStateProbe> {
	const router = getIosBackendRouter();
	const backend = router.selectBackend(params.deviceId);
	const command = backend.buildHierarchyCaptureCommand(params.deviceId);

	const hierarchyExec = await executeRunnerWithTestHooks(
		command,
		params.repoRoot,
		process.env,
		{ timeoutMs: IOS_KEYBOARD_PROBE_TIMEOUT_MS },
	);

	let primaryKeyboard: string | undefined;
	if (isIosSimulatorUdid(params.deviceId)) {
		try {
			const imeExec = await executeRunnerWithTestHooks(
				[CLI_COMMANDS.xcrun, "simctl", "spawn", params.deviceId, "defaults", "read", "-g", "AppleKeyboards"],
				params.repoRoot,
				process.env,
				{ timeoutMs: IOS_APPLE_KEYBOARDS_TIMEOUT_MS },
			);
			if (imeExec.exitCode === 0) {
				primaryKeyboard = parseAppleKeyboardsOutput(imeExec.stdout)[0];
			}
		} catch {
			// Best-effort IME metadata; never block typing on simulator defaults query.
		}
	}

	if (hierarchyExec.exitCode !== 0) {
		return {
			checked: true,
			platform: "ios",
			visibility: "unknown",
			reason: "ios_keyboard_probe_failed",
			...(primaryKeyboard ? { imeType: primaryKeyboard } : {}),
			command,
			exitCode: hierarchyExec.exitCode,
		};
	}

	const nodes = parseIosInspectNodes(hierarchyExec.stdout);
	const classification = classifyIosKeyboardStateFromNodes(nodes, primaryKeyboard);
	return {
		checked: true,
		platform: "ios",
		...classification,
		command,
		exitCode: hierarchyExec.exitCode,
	};
}

export function createIosUiRuntimeHooks(): UiRuntimePlatformHooks {
	const router = getIosBackendRouter();

	return {
		platform: "ios",
		requiresProbe: true,
		probeFailureReasonCode: REASON_CODES.configurationError,
		probeKeyboardState: probeIosKeyboardState,
		buildTapCommand: (deviceId, x, y) => {
			const backend = router.selectBackend(deviceId);
			return backend.buildTapCommand(deviceId, x, y);
		},
		buildDescribePointCommand: (deviceId, x, y) => {
			const backend = router.selectBackend(deviceId);
			return backend.buildDescribePointCommand
				? backend.buildDescribePointCommand(deviceId, x, y)
				: backend.buildHierarchyCaptureCommand(deviceId);
		},
		verifyResolvedPoint: verifyResolvedIosPointWithHooks,
		verifyTypedPostcondition: verifyTypedIosPostconditionWithHooks,
		settleAfterFocus: async ({ settleDelayMs }) => {
			const envDelayRaw = process.env.M2E_IOS_FOCUS_SETTLE_MS;
			const parsedEnvDelay =
				envDelayRaw !== undefined && envDelayRaw.trim().length > 0
					? Number(envDelayRaw)
					: undefined;
			const delayMs =
				settleDelayMs ??
				(parsedEnvDelay !== undefined &&
				Number.isFinite(parsedEnvDelay) &&
				parsedEnvDelay >= 0
					? Math.floor(parsedEnvDelay)
					: DEFAULT_IOS_FOCUS_SETTLE_DELAY_MS);
			if (delayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		},
		buildTypeTextCommand: (deviceId, text) => {
			const backend = router.selectBackend(deviceId);
			return backend.buildTypeTextCommand(deviceId, text);
		},
		buildSwipeCommand: (deviceId, swipe) => {
			const backend = router.selectBackend(deviceId);
			return backend.buildSwipeCommand(deviceId, swipe);
		},
		buildGestureCommands: (deviceId, gesture) => {
			const backend = router.selectBackend(deviceId);
			if (gesture.type === "sequence") {
				if (backend.buildBatchGestureCommands) {
					const batchPlan = backend.buildBatchGestureCommands(deviceId, gesture.steps);
					return {
						supported: true,
						commands: batchPlan.commands,
						stepDelaysMs: batchPlan.stepDelaysMs,
						commandTimeoutMs: Math.max(30000, gesture.durationMs + 15000),
						supportLevel: "full",
						backendId: backend.backendId,
					};
				}
			} else if (gesture.type === "draw") {
				if (backend.buildDrawCommand) {
					return {
						supported: true,
						commands: [
							backend.buildDrawCommand(deviceId, {
								points: gesture.points,
								durationMs: gesture.durationMs,
								close: gesture.close,
								preDelayMs: gesture.preDelayMs,
								postDelayMs: gesture.postDelayMs,
							}),
						],
						supportLevel: "full",
						backendId: backend.backendId,
					};
				}
			} else if (gesture.type === "drag") {
				if (backend.buildDragCommand) {
					return {
						supported: true,
						commands: [
							backend.buildDragCommand(deviceId, {
								start: gesture.start,
								end: gesture.end,
								durationMs: gesture.durationMs,
								steps: gesture.steps,
								holdMs: gesture.holdMs,
								preDelayMs: gesture.preDelayMs,
								postDelayMs: gesture.postDelayMs,
							}),
						],
						supportLevel: "full",
						backendId: backend.backendId,
					};
				}
			} else if (backend.buildMultiTouchGestureCommand) {
				return {
					supported: true,
					commands: [backend.buildMultiTouchGestureCommand(deviceId, gesture)],
					supportLevel: "full",
					backendId: backend.backendId,
				};
			}
			return {
				supported: false,
				backendId: backend.backendId,
				reason: `Selected iOS backend '${backend.backendId}' does not support perform_gesture (${gesture.type}).`,
				suggestion: "Use an iOS simulator with AXe v2.2+ installed (brew install cameroncooke/axe/axe).",
			};
		},
		buildBackPressedCommand: () => {
			throw new Error(
				"iOS does not support deterministic system-level back navigation. Use navigate_back with target: 'app' and a selector for app-level back.",
			);
		},
		buildHierarchyCapturePreviewCommand: (deviceId) => {
			const backend = router.selectBackend(deviceId);
			return backend.buildHierarchyCaptureCommand(deviceId);
		},
		probeRuntimeAvailability: async (repoRoot) => {
			const summary = await router.probeAllBackends(repoRoot);
			if (summary.simctl.available)
				return {
					exitCode: 0,
					stdout: `simctl ${summary.simctl.version ?? ""}`,
					stderr: "",
				};
			if (summary.devicectl.available)
				return {
					exitCode: 0,
					stdout: `devicectl ${summary.devicectl.version ?? ""}`,
					stderr: "",
				};
			return undefined;
		},
		probeUnavailableSuggestion: buildProbeSuggestion,
		tapDryRunSuggestion:
			"Run tap without dryRun to perform iOS coordinate tap through the auto-selected backend (simctl for simulators, devicectl+Maestro for physical devices).",
		tapFailureSuggestion:
			"If iOS tap fails, check simulator boot state or physical device connectivity. Verify backend selection with 'mobile-e2e-mcp doctor'.",
		typeTextDryRunSuggestion:
			"Run type_text without dryRun to perform iOS text entry through the auto-selected backend.",
		typeTextFailureSuggestion:
			"If iOS type_text fails, verify backend availability and device state. Run 'mobile-e2e-mcp doctor' for diagnostics.",
	};
}
