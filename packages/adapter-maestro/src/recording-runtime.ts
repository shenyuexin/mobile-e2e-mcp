import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	type CancelRecordSessionData,
	type CancelRecordSessionInput,
	type EndRecordSessionData,
	type EndRecordSessionInput,
	type GetRecordSessionStatusInput,
	type RawRecordedEvent,
	REASON_CODES,
	type RecordSessionStatusData,
	type StartRecordSessionData,
	type StartRecordSessionInput,
	type ToolResult,
} from "@mobile-e2e-mcp/contracts";
import type { PersistedRecordSession } from "@mobile-e2e-mcp/core";
import {
	buildRecordEventsRelativePath,
	buildRecordedStepsRelativePath,
	buildRecordSessionRelativePath,
	listRawRecordedEvents,
	loadRecordedSteps,
	loadRecordSession,
	persistRawRecordedEvents,
	persistRecordedSteps,
	persistRecordSessionState,
	persistStartedRecordSession,
} from "@mobile-e2e-mcp/core";
import { buildDefaultAppId, resolveRepoPath } from "./harness-config.js";
import {
	mapRawEventsToRecordedSteps,
	renderRecordedStepsAsFlow,
} from "./recording-mapper.js";
import {
	choosePreferredAndroidDeviceId,
	parseAdbDeviceEntries,
	parseRawInputEvents,
} from "./recording-runtime-android.js";
import {
	choosePreferredIosDeviceId,
	parseIosRawInputEvents,
	parseSimctlDeviceEntries,
} from "./recording-runtime-ios.js";
import { resolveRecordingPlatformHooks } from "./recording-runtime-platform.js";
import {
	parseAndroidUiHierarchyNodes,
	parseIosInspectNodes,
	parseUiBounds,
} from "./ui-model.js";

interface ExtendedRawRecordedEvent extends RawRecordedEvent {
	eventMonotonicMs?: number;
	normalizedPoint?: { x: number; y: number };
	gesture?: {
		kind: "tap" | "swipe";
		start?: { x: number; y: number };
		end?: { x: number; y: number };
		durationMs?: number;
	};
	resolvedSelector?: {
		identifier?: string;
		resourceId?: string;
		text?: string;
		value?: string;
		contentDesc?: string;
		className?: string;
	};
}

interface ResolvedSelector {
	identifier?: string;
	resourceId?: string;
	text?: string;
	value?: string;
	contentDesc?: string;
	className?: string;
}

interface SnapshotCandidate {
	ref: string;
	capturedAtMs: number;
}

interface ViewportSize {
	width: number;
	height: number;
}

async function listSnapshotRefsForSession(
	repoRoot: string,
	recordSessionId: string,
): Promise<string[]> {
	const relativeDir = path.posix.join(
		"artifacts",
		"record-snapshots",
		recordSessionId,
	);
	const absoluteDir = path.resolve(repoRoot, relativeDir);
	try {
		const entries = await readdir(absoluteDir, { withFileTypes: true });
		return entries
			.filter(
				(entry) =>
					entry.isFile() &&
					(entry.name.endsWith(".xml") || entry.name.endsWith(".json")),
			)
			.map((entry) => path.posix.join(relativeDir, entry.name))
			.sort();
	} catch {
		return [];
	}
}

function parseSnapshotNodes(
	snapshot: string,
): ReturnType<typeof parseAndroidUiHierarchyNodes> {
	const trimmed = snapshot.trim();
	if (trimmed.startsWith("<")) {
		return parseAndroidUiHierarchyNodes(snapshot);
	}
	return parseIosInspectNodes(snapshot);
}

function parseSnapshotCapturedAtMs(ref: string): number | undefined {
	const match = ref.match(/-(\d{13})\.(?:xml|json)$/);
	if (!match) {
		return undefined;
	}
	const parsed = Number.parseInt(match[1], 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function chooseNearestSnapshotRef(
	eventTimestampIso: string,
	snapshots: SnapshotCandidate[],
): string | undefined {
	if (snapshots.length === 0) {
		return undefined;
	}
	const eventTimestampMs = Date.parse(eventTimestampIso);
	if (!Number.isFinite(eventTimestampMs)) {
		return snapshots[0]?.ref;
	}
	let closestBefore: SnapshotCandidate | undefined;
	for (const snapshot of snapshots) {
		if (snapshot.capturedAtMs <= eventTimestampMs) {
			closestBefore = snapshot;
			continue;
		}
		break;
	}
	return closestBefore?.ref ?? snapshots[0]?.ref;
}

function resolveSelectorAtPoint(
	snapshot: string,
	x?: number,
	y?: number,
): ResolvedSelector | undefined {
	if (x === undefined || y === undefined) {
		return undefined;
	}
	const nodes = parseSnapshotNodes(snapshot);
	let best: { area: number; selector: ResolvedSelector } | undefined;
	for (const node of nodes) {
		const bounds = parseUiBounds(node.bounds);
		if (!bounds) {
			continue;
		}
		if (
			x < bounds.left ||
			x > bounds.right ||
			y < bounds.top ||
			y > bounds.bottom
		) {
			continue;
		}
		const selector: ResolvedSelector = {
			identifier: node.resourceId,
			resourceId: node.resourceId,
			text: node.text,
			contentDesc: node.contentDesc,
			className: node.className,
			value: node.text,
		};
		if (
			!selector.identifier &&
			!selector.resourceId &&
			!selector.text &&
			!selector.contentDesc &&
			!selector.value
		) {
			continue;
		}
		const area = bounds.width * bounds.height;
		if (!best || area < best.area) {
			best = { area, selector };
		}
	}
	return best?.selector;
}

function deriveViewportSizeFromSnapshot(
	snapshot: string,
): ViewportSize | undefined {
	const nodes = parseSnapshotNodes(snapshot);
	let maxRight = 0;
	let maxBottom = 0;
	for (const node of nodes) {
		const bounds = parseUiBounds(node.bounds);
		if (!bounds) {
			continue;
		}
		if (bounds.right > maxRight) {
			maxRight = bounds.right;
		}
		if (bounds.bottom > maxBottom) {
			maxBottom = bounds.bottom;
		}
	}
	if (maxRight <= 0 || maxBottom <= 0) {
		return undefined;
	}
	return { width: maxRight, height: maxBottom };
}

function deriveViewportSizeFromXml(xml: string): ViewportSize | undefined {
	return deriveViewportSizeFromSnapshot(xml);
}

function normalizeCoordinate(
	raw: number,
	rawMax: number,
	viewportMax: number,
): number {
	if (rawMax <= 0 || viewportMax <= 0) {
		return raw;
	}
	const scaled = Math.round((raw / rawMax) * viewportMax);
	return Math.min(viewportMax, Math.max(0, scaled));
}

function normalizeEventsToViewport(
	events: ExtendedRawRecordedEvent[],
	viewport: ViewportSize,
): ExtendedRawRecordedEvent[] {
	const coordinateValues = events.flatMap((event) => {
		const values: number[] = [];
		if (event.x !== undefined) values.push(event.x);
		if (event.y !== undefined) values.push(event.y);
		if (event.gesture?.start?.x !== undefined)
			values.push(event.gesture.start.x);
		if (event.gesture?.start?.y !== undefined)
			values.push(event.gesture.start.y);
		if (event.gesture?.end?.x !== undefined) values.push(event.gesture.end.x);
		if (event.gesture?.end?.y !== undefined) values.push(event.gesture.end.y);
		return values;
	});

	if (coordinateValues.length === 0) {
		return events;
	}

	const maxX = Math.max(
		0,
		...events.flatMap((event) => [
			event.x ?? 0,
			event.gesture?.start?.x ?? 0,
			event.gesture?.end?.x ?? 0,
		]),
	);
	const maxY = Math.max(
		0,
		...events.flatMap((event) => [
			event.y ?? 0,
			event.gesture?.start?.y ?? 0,
			event.gesture?.end?.y ?? 0,
		]),
	);
	const appearsRawAxisSpace =
		maxX > viewport.width * 1.2 || maxY > viewport.height * 1.2;
	if (!appearsRawAxisSpace) {
		return events;
	}

	return events.map((event) => {
		const normalizedX =
			event.x !== undefined
				? normalizeCoordinate(event.x, maxX, viewport.width)
				: undefined;
		const normalizedY =
			event.y !== undefined
				? normalizeCoordinate(event.y, maxY, viewport.height)
				: undefined;
		const normalizedGesture = event.gesture
			? {
					...event.gesture,
					...(event.gesture.start
						? {
								start: {
									x: normalizeCoordinate(
										event.gesture.start.x,
										maxX,
										viewport.width,
									),
									y: normalizeCoordinate(
										event.gesture.start.y,
										maxY,
										viewport.height,
									),
								},
							}
						: {}),
					...(event.gesture.end
						? {
								end: {
									x: normalizeCoordinate(
										event.gesture.end.x,
										maxX,
										viewport.width,
									),
									y: normalizeCoordinate(
										event.gesture.end.y,
										maxY,
										viewport.height,
									),
								},
							}
						: {}),
				}
			: undefined;
		return {
			...event,
			x: normalizedX,
			y: normalizedY,
			gesture: normalizedGesture,
			normalizedPoint:
				normalizedX !== undefined && normalizedY !== undefined
					? { x: normalizedX, y: normalizedY }
					: event.normalizedPoint,
		};
	});
}

async function maybeNormalizeEventsUsingSnapshotViewport(
	repoRoot: string,
	recordSessionId: string,
	events: ExtendedRawRecordedEvent[],
	fallbackSnapshotRef?: string,
): Promise<ExtendedRawRecordedEvent[]> {
	const snapshotRefs = await listSnapshotRefsForSession(
		repoRoot,
		recordSessionId,
	);
	const candidateRefs =
		snapshotRefs.length > 0
			? snapshotRefs
			: fallbackSnapshotRef
				? [fallbackSnapshotRef]
				: [];
	for (const ref of candidateRefs) {
		const snapshotXml = await readFile(
			path.resolve(repoRoot, ref),
			"utf8",
		).catch(() => "");
		if (!snapshotXml) {
			continue;
		}
		const viewport = deriveViewportSizeFromSnapshot(snapshotXml);
		if (!viewport) {
			continue;
		}
		return normalizeEventsToViewport(events, viewport);
	}
	return events;
}

function mapMonotonicToIso(
	startedAt: string,
	eventMonotonicMs: number | undefined,
	anchorMonotonicMs: number | undefined,
): string {
	if (!eventMonotonicMs || !anchorMonotonicMs) {
		return new Date().toISOString();
	}
	const delta = Math.max(0, eventMonotonicMs - anchorMonotonicMs);
	return new Date(Date.parse(startedAt) + delta).toISOString();
}

async function enrichEventsWithSelectors(
	repoRoot: string,
	events: ExtendedRawRecordedEvent[],
): Promise<ExtendedRawRecordedEvent[]> {
	const snapshotCache = new Map<string, string>();
	const enriched: ExtendedRawRecordedEvent[] = [];
	for (const event of events) {
		if (
			event.resolvedSelector ||
			!event.uiSnapshotRef ||
			event.x === undefined ||
			event.y === undefined
		) {
			enriched.push(event);
			continue;
		}
		const snapshotAbsolutePath = path.resolve(repoRoot, event.uiSnapshotRef);
		let snapshotXml = snapshotCache.get(snapshotAbsolutePath);
		if (snapshotXml === undefined) {
			snapshotXml = await readFile(snapshotAbsolutePath, "utf8").catch(
				() => "",
			);
			snapshotCache.set(snapshotAbsolutePath, snapshotXml);
		}
		const selector =
			snapshotXml.length > 0
				? resolveSelectorAtPoint(snapshotXml, event.x, event.y)
				: undefined;
		enriched.push({
			...event,
			resolvedSelector: selector,
			normalizedPoint:
				event.x !== undefined && event.y !== undefined
					? { x: event.x, y: event.y }
					: event.normalizedPoint,
		});
	}
	return enriched;
}

export async function startRecordSessionWithMaestro(
	input: StartRecordSessionInput,
): Promise<ToolResult<StartRecordSessionData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSessionId = `rec-${Date.now()}-${randomUUID().slice(0, 8)}`;
	const startedAt = new Date().toISOString();
	const platform = input.platform ?? "android";
	const hooks = resolveRecordingPlatformHooks(platform);
	const resolvedDeviceId = await hooks.resolveDeviceId(
		repoRoot,
		input.deviceId,
		input.dryRun,
	);

	if (!resolvedDeviceId) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.deviceUnavailable,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId,
				sessionId: input.sessionId,
				platform,
				deviceId: "unknown",
				appId: input.appId ?? buildDefaultAppId(platform),
				recordingProfile: input.recordingProfile ?? "default",
				status: "cancelled",
				startedAt,
				captureChannels: hooks.captureChannels,
				rawEventsPath: buildRecordEventsRelativePath(recordSessionId),
			},
			nextSuggestions: [hooks.unavailableDeviceSuggestion],
		};
	}

	const deviceId = resolvedDeviceId;
	const appId = input.appId ?? buildDefaultAppId(platform);
	const rawEventsRelativePath = buildRecordEventsRelativePath(recordSessionId);
	const rawEventsAbsolutePath = path.resolve(repoRoot, rawEventsRelativePath);
	await mkdir(path.dirname(rawEventsAbsolutePath), { recursive: true });
	const captureChannels = hooks.captureChannels;
	const captureStartMonotonicMs = await hooks.readCaptureStartMonotonicMs(
		repoRoot,
		deviceId,
		input.dryRun,
	);
	const captureStart = await hooks.startCaptureProcesses({
		repoRoot,
		recordSessionId,
		deviceId,
		rawEventsAbsolutePath,
		dryRun: input.dryRun,
	});
	if (captureStart.failureSuggestion) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.sessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId,
				sessionId: input.sessionId,
				platform,
				deviceId,
				appId,
				recordingProfile: input.recordingProfile ?? "default",
				status: "cancelled",
				startedAt,
				captureChannels,
				rawEventsPath: rawEventsRelativePath,
			},
			nextSuggestions: [captureStart.failureSuggestion],
		};
	}
	const { pid, snapshotPid } = captureStart;

	const persisted = await persistStartedRecordSession(repoRoot, {
		recordSessionId,
		sessionId: input.sessionId,
		platform,
		deviceId,
		appId,
		recordingProfile: input.recordingProfile ?? "default",
		startedAt,
		captureChannels,
		rawEventsPath: rawEventsRelativePath,
		pid,
		...(captureStartMonotonicMs !== undefined
			? { captureStartMonotonicMs }
			: {}),
		...(snapshotPid ? { snapshotPid } : {}),
	});

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: input.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [persisted.relativePath, rawEventsRelativePath],
		data: {
			recordSessionId,
			sessionId: input.sessionId,
			platform,
			deviceId,
			appId,
			recordingProfile: input.recordingProfile ?? "default",
			status: "running",
			startedAt,
			captureChannels,
			rawEventsPath: rawEventsRelativePath,
			pid,
		},
		nextSuggestions: hooks.startSuccessSuggestions,
	};
}

export async function getRecordSessionStatusWithMaestro(
	input: GetRecordSessionStatusInput,
): Promise<ToolResult<RecordSessionStatusData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSession = await loadRecordSession(
		repoRoot,
		input.recordSessionId,
	);
	if (!recordSession) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.recordSessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId: input.recordSessionId,
				sessionId: "unknown",
				platform: "android",
				deviceId: "unknown",
				status: "cancelled",
				startedAt: new Date(0).toISOString(),
				rawEventCount: 0,
				recordedStepCount: 0,
				rawEventsPath: buildRecordEventsRelativePath(input.recordSessionId),
				warnings: ["Record session does not exist."],
			},
			nextSuggestions: ["Start a new record session before querying status."],
		};
	}

	const [events, steps] = await Promise.all([
		listRawRecordedEvents(repoRoot, input.recordSessionId),
		loadRecordedSteps(repoRoot, input.recordSessionId),
	]);
	const hooks = resolveRecordingPlatformHooks(recordSession.platform);

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: recordSession.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [
			buildRecordSessionRelativePath(input.recordSessionId),
			recordSession.rawEventsPath,
		],
		data: {
			recordSessionId: recordSession.recordSessionId,
			sessionId: recordSession.sessionId,
			platform: recordSession.platform,
			deviceId: recordSession.deviceId,
			appId: recordSession.appId,
			status: recordSession.status,
			startedAt: recordSession.startedAt,
			endedAt: recordSession.endedAt,
			rawEventCount: events.length,
			recordedStepCount: steps.length,
			rawEventsPath: recordSession.rawEventsPath,
			flowPath: recordSession.flowPath,
			warnings: recordSession.warnings,
		},
		nextSuggestions:
			recordSession.status === "running"
				? hooks.runningStatusSuggestions
				: recordSession.platform === "ios" && recordSession.warnings.length > 0
					? ["Review iOS recording warnings in status output before replay."]
					: [],
	};
}

export async function endRecordSessionWithMaestro(
	input: EndRecordSessionInput,
): Promise<ToolResult<EndRecordSessionData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSession = await loadRecordSession(
		repoRoot,
		input.recordSessionId,
	);
	if (!recordSession) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.recordSessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId: input.recordSessionId,
				status: "cancelled",
				endedAt: new Date().toISOString(),
				report: {
					stepCount: 0,
					warnings: ["Record session does not exist."],
					confidenceSummary: { high: 0, medium: 0, low: 0 },
					reviewRequired: true,
				},
			},
			nextSuggestions: [
				"Start a new record session and retry end_record_session.",
			],
		};
	}

	const hooks = resolveRecordingPlatformHooks(recordSession.platform);

	if (
		recordSession.pid &&
		recordSession.status === "running" &&
		!input.dryRun
	) {
		try {
			process.kill(recordSession.pid, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	const snapshotProcessId = (
		recordSession as PersistedRecordSession & { snapshotPid?: number }
	).snapshotPid;
	if (snapshotProcessId && !input.dryRun) {
		try {
			process.kill(snapshotProcessId, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	let capturedEvents = (await listRawRecordedEvents(
		repoRoot,
		input.recordSessionId,
	)) as ExtendedRawRecordedEvent[];
	const contextSnapshot = await hooks.captureContextSnapshot({
		repoRoot,
		recordSessionId: input.recordSessionId,
		deviceId: recordSession.deviceId,
		bucketId: "end",
		dryRun: input.dryRun,
	});

	if (capturedEvents.length === 0) {
		const absolutePath = path.resolve(repoRoot, recordSession.rawEventsPath);
		const rawContent = await readFile(absolutePath, "utf8").catch(() => "");
		const parsed = hooks.parseRawEvents(rawContent);
		if (
			input.dryRun &&
			recordSession.platform === "ios" &&
			parsed.length === 0
		) {
			parsed.push(
				{
					type: "tap",
					eventMonotonicMs: 100,
					x: 160,
					y: 280,
					gesture: {
						kind: "tap",
						start: { x: 160, y: 280 },
						end: { x: 160, y: 280 },
						durationMs: 60,
					},
					rawLine: "dry-run-ios-synthetic-tap",
				},
				{
					type: "type",
					eventMonotonicMs: 220,
					textDelta: "demo@example.com",
					rawLine: "dry-run-ios-synthetic-type",
				},
			);
		}
		const snapshotRefs = await listSnapshotRefsForSession(
			repoRoot,
			input.recordSessionId,
		);
		const fallbackSnapshotRefs = contextSnapshot.uiSnapshotRef
			? [contextSnapshot.uiSnapshotRef]
			: [];
		const resolvedSnapshotRefs =
			snapshotRefs.length > 0 ? snapshotRefs : fallbackSnapshotRefs;
		const snapshotCandidates: SnapshotCandidate[] = resolvedSnapshotRefs
			.map((ref) => {
				const capturedAtMs = parseSnapshotCapturedAtMs(ref);
				return capturedAtMs !== undefined ? { ref, capturedAtMs } : undefined;
			})
			.filter(
				(candidate): candidate is SnapshotCandidate => candidate !== undefined,
			)
			.sort((left, right) => left.capturedAtMs - right.capturedAtMs);
		const anchorMonotonicMs =
			(
				recordSession as PersistedRecordSession & {
					captureStartMonotonicMs?: number;
				}
			).captureStartMonotonicMs ??
			parsed.find((event) => event.eventMonotonicMs > 0)?.eventMonotonicMs;
		const normalized: ExtendedRawRecordedEvent[] = parsed.map(
			(event, index) => {
				const mappedTimestamp = mapMonotonicToIso(
					recordSession.startedAt,
					event.eventMonotonicMs,
					anchorMonotonicMs,
				);
				const snapshotRef =
					chooseNearestSnapshotRef(mappedTimestamp, snapshotCandidates) ??
					resolvedSnapshotRefs[
						Math.min(index, Math.max(0, resolvedSnapshotRefs.length - 1))
					];
				return {
					eventId: `${input.recordSessionId}-${index + 1}`,
					recordSessionId: input.recordSessionId,
					timestamp: mappedTimestamp,
					eventMonotonicMs: event.eventMonotonicMs,
					eventType: event.type,
					x: event.x,
					y: event.y,
					gesture: event.gesture,
					normalizedPoint:
						event.x !== undefined && event.y !== undefined
							? { x: event.x, y: event.y }
							: undefined,
					textDelta: event.textDelta,
					rawLine: event.rawLine,
					foregroundApp: contextSnapshot.foregroundApp ?? recordSession.appId,
					uiSnapshotRef: snapshotRef,
				};
			},
		);
		const viewportNormalized = await maybeNormalizeEventsUsingSnapshotViewport(
			repoRoot,
			input.recordSessionId,
			normalized,
			contextSnapshot.uiSnapshotRef,
		);
		const enrichedNormalized = await enrichEventsWithSelectors(
			repoRoot,
			viewportNormalized,
		);
		if (enrichedNormalized.length > 0) {
			await persistRawRecordedEvents(
				repoRoot,
				input.recordSessionId,
				enrichedNormalized as RawRecordedEvent[],
			);
			capturedEvents = enrichedNormalized;
		}
	} else {
		const viewportNormalized = await maybeNormalizeEventsUsingSnapshotViewport(
			repoRoot,
			input.recordSessionId,
			capturedEvents,
			contextSnapshot.uiSnapshotRef,
		);
		capturedEvents = await enrichEventsWithSelectors(
			repoRoot,
			viewportNormalized,
		);
	}

	const mapped = mapRawEventsToRecordedSteps(
		input.recordSessionId,
		capturedEvents,
		{
			defaultAppId: recordSession.appId,
			includeAutoWaitStep: true,
		},
	);
	await persistRecordedSteps(repoRoot, input.recordSessionId, mapped.steps);

	let flowPath: string | undefined;
	let replayDryRun: EndRecordSessionData["report"]["replayDryRun"];
	const warnings = [...mapped.warnings, ...contextSnapshot.warnings];
	if (input.autoExport !== false) {
		const targetFlowPath =
			input.outputPath ??
			path.posix.join(
				"flows",
				"samples",
				"generated",
				`${input.recordSessionId}-${Date.now()}.yaml`,
			);
		const absoluteFlowPath = path.resolve(repoRoot, targetFlowPath);
		await mkdir(path.dirname(absoluteFlowPath), { recursive: true });
		const rendered = renderRecordedStepsAsFlow({
			appId: recordSession.appId ?? "com.example.app",
			includeLaunchStep: input.includeLaunchStep !== false,
			steps: mapped.steps,
		});
		warnings.push(...rendered.warnings);
		await writeFile(absoluteFlowPath, rendered.yaml, "utf8");
		flowPath = targetFlowPath;

		if (input.runReplayDryRun) {
			const { runFlowWithMaestro } = await import("./index.js");
			const replayResult = await runFlowWithMaestro({
				sessionId: recordSession.sessionId,
				platform: recordSession.platform,
				flowPath,
				dryRun: true,
				deviceId: recordSession.deviceId,
				appId: recordSession.appId,
			});
			replayDryRun = {
				status: replayResult.status,
				reasonCode: replayResult.reasonCode,
			};
		}
	}

	const confidenceSummary = mapped.steps.reduce(
		(acc, step) => {
			acc[step.confidence] += 1;
			return acc;
		},
		{ high: 0, medium: 0, low: 0 },
	);
	const endedAt = new Date().toISOString();
	await persistRecordSessionState(repoRoot, input.recordSessionId, {
		status: "ended",
		endedAt,
		flowPath,
		warnings,
		pid: undefined,
		snapshotPid: undefined,
	});

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: recordSession.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [
			buildRecordSessionRelativePath(input.recordSessionId),
			recordSession.rawEventsPath,
			buildRecordedStepsRelativePath(input.recordSessionId),
			...(flowPath ? [flowPath] : []),
		],
		data: {
			recordSessionId: input.recordSessionId,
			status: "ended",
			endedAt,
			report: {
				flowPath,
				stepCount: mapped.steps.length,
				warnings,
				confidenceSummary,
				reviewRequired: confidenceSummary.low > 0 || warnings.length > 0,
				replayDryRun,
			},
		},
		nextSuggestions: flowPath
			? recordSession.platform === "ios"
				? [
						`Replay with run_flow and flowPath='${flowPath}'.`,
						"If replay fails, inspect iOS selector confidence and idb snapshot warnings in report.warnings.",
					]
				: [`Replay with run_flow and flowPath='${flowPath}'.`]
			: [hooks.endSessionNoFlowSuggestion],
	};
}

export async function cancelRecordSessionWithMaestro(
	input: CancelRecordSessionInput,
): Promise<ToolResult<CancelRecordSessionData>> {
	const startTime = Date.now();
	const repoRoot = resolveRepoPath();
	const recordSession = await loadRecordSession(
		repoRoot,
		input.recordSessionId,
	);
	if (!recordSession) {
		return {
			status: "failed",
			reasonCode: REASON_CODES.configurationError,
			sessionId: input.recordSessionId,
			durationMs: Date.now() - startTime,
			attempts: 1,
			artifacts: [],
			data: {
				recordSessionId: input.recordSessionId,
				cancelled: false,
				status: "cancelled",
			},
			nextSuggestions: ["Record session not found."],
		};
	}
	const hooks = resolveRecordingPlatformHooks(recordSession.platform);

	if (recordSession.pid && recordSession.status === "running") {
		try {
			process.kill(recordSession.pid, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	const snapshotProcessId = (
		recordSession as PersistedRecordSession & { snapshotPid?: number }
	).snapshotPid;
	if (snapshotProcessId && recordSession.status === "running") {
		try {
			process.kill(snapshotProcessId, "SIGTERM");
		} catch (error) {
			void error;
		}
	}

	const endedAt = new Date().toISOString();
	await persistRecordSessionState(repoRoot, input.recordSessionId, {
		status: "cancelled",
		endedAt,
		warnings: [...recordSession.warnings, "Recording was cancelled by user."],
		pid: undefined,
		snapshotPid: undefined,
	});

	return {
		status: "success",
		reasonCode: REASON_CODES.ok,
		sessionId: recordSession.sessionId,
		durationMs: Date.now() - startTime,
		attempts: 1,
		artifacts: [
			buildRecordSessionRelativePath(input.recordSessionId),
			recordSession.rawEventsPath,
		],
		data: {
			recordSessionId: input.recordSessionId,
			cancelled: true,
			status: "cancelled",
			endedAt,
		},
		nextSuggestions: [hooks.cancelSuggestion],
	};
}

export const recordingRuntimeInternals = {
	parseAdbDeviceEntries,
	choosePreferredAndroidDeviceId,
	parseRawInputEvents,
	parseIosRawInputEvents,
	parseSimctlDeviceEntries,
	choosePreferredIosDeviceId,
	deriveViewportSizeFromXml,
	deriveViewportSizeFromSnapshot,
	normalizeEventsToViewport,
	parseSnapshotCapturedAtMs,
	chooseNearestSnapshotRef,
	mapMonotonicToIso,
};
