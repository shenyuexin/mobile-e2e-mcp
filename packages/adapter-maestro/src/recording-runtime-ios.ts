import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDefaultDeviceId } from "./harness-config.js";
import type {
	ParsedRawEvent,
	RecordingCaptureStartParams,
	RecordingCaptureStartResult,
	RecordingContextSnapshotParams,
	RecordingContextSnapshotResult,
	RecordingPlatformHooks,
} from "./recording-runtime-platform.js";
import { executeRunner, shellEscape } from "./runtime-shared.js";
import {
	buildIosUiDescribeCommand,
	probeIdbAvailability,
} from "./ui-runtime.js";

export interface SimctlDeviceEntry {
	udid: string;
	state: string;
	isAvailable: boolean;
}

function spawnDetachedShell(
	command: string,
	repoRoot: string,
	env: NodeJS.ProcessEnv,
): number | undefined {
	const child = spawn("bash", ["-lc", command], {
		cwd: repoRoot,
		env,
		detached: true,
		stdio: "ignore",
	});
	child.unref();
	return Number.isFinite(child.pid) ? child.pid : undefined;
}

export function parseSimctlDeviceEntries(output: string): SimctlDeviceEntry[] {
	try {
		const parsed = JSON.parse(output) as {
			devices?: Record<
				string,
				Array<{ udid?: string; state?: string; isAvailable?: boolean }>
			>;
		};
		const runtimeEntries = Object.values(parsed.devices ?? {});
		const flattened = runtimeEntries.flatMap((items) => items ?? []);
		return flattened
			.map((entry) => ({
				udid: entry.udid ?? "",
				state: entry.state ?? "Shutdown",
				isAvailable: entry.isAvailable !== false,
			}))
			.filter((entry) => entry.udid.length > 0);
	} catch {
		return [];
	}
}

export function choosePreferredIosDeviceId(
	entries: SimctlDeviceEntry[],
	requestedDeviceId?: string,
): string | undefined {
	if (requestedDeviceId) {
		const requested = entries.find(
			(entry) => entry.udid === requestedDeviceId && entry.isAvailable,
		);
		return requested?.udid;
	}
	const available = entries.filter((entry) => entry.isAvailable);
	const booted = available.find(
		(entry) => entry.state.toLowerCase() === "booted",
	);
	return booted?.udid ?? available[0]?.udid;
}

export async function resolveIosRecordingDeviceId(
	repoRoot: string,
	inputDeviceId?: string,
	dryRun?: boolean,
): Promise<string | undefined> {
	if (dryRun) {
		return inputDeviceId ?? buildDefaultDeviceId("ios");
	}
	const listed = await executeRunner(
		["xcrun", "simctl", "list", "devices", "--json"],
		repoRoot,
		process.env,
	);
	if (listed.exitCode !== 0) {
		return undefined;
	}
	return choosePreferredIosDeviceId(
		parseSimctlDeviceEntries(listed.stdout),
		inputDeviceId,
	);
}

export async function captureIosContextSnapshot(
	params: RecordingContextSnapshotParams,
): Promise<RecordingContextSnapshotResult> {
	const warnings: string[] = [];
	const bucketId = params.bucketId ?? "end";
	const snapshotRelativePath = path.posix.join(
		"artifacts",
		"record-snapshots",
		params.recordSessionId,
		`${params.recordSessionId}-${bucketId}.json`,
	);
	const snapshotAbsolutePath = path.resolve(
		params.repoRoot,
		snapshotRelativePath,
	);

	if (params.dryRun) {
		return {
			uiSnapshotRef: snapshotRelativePath,
			foregroundApp: "com.example.app",
			warnings,
		};
	}

	const idbProbe = await probeIdbAvailability(params.repoRoot);
	if (!idbProbe || idbProbe.exitCode !== 0) {
		warnings.push("Failed to capture iOS UI snapshot: idb is unavailable.");
		return { warnings };
	}

	await mkdir(path.dirname(snapshotAbsolutePath), { recursive: true });
	const command = buildIosUiDescribeCommand(params.deviceId);
	const snapshotResult = await executeRunner(
		command,
		params.repoRoot,
		process.env,
	);
	if (snapshotResult.exitCode !== 0) {
		warnings.push("Failed to capture iOS UI snapshot via idb ui describe-all.");
		return { warnings };
	}

	await writeFile(snapshotAbsolutePath, snapshotResult.stdout, "utf8");
	return {
		uiSnapshotRef: snapshotRelativePath,
		warnings,
	};
}

function extractIosLogTimestampMs(line: string): number | undefined {
	const isoLike = line.match(
		/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
	);
	if (!isoLike) {
		return undefined;
	}
	const normalized = isoLike[1].replace(" ", "T");
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function extractCoordinatePairs(line: string): Array<{ x: number; y: number }> {
	const coordinateRegex =
		/(?:\(|\[|\{)?\s*(\d{1,5})\s*[,x]\s*(\d{1,5})\s*(?:\)|\]|\})?/g;
	const pairs: Array<{ x: number; y: number }> = [];
	for (const match of line.matchAll(coordinateRegex)) {
		const x = Number.parseInt(match[1], 10);
		const y = Number.parseInt(match[2], 10);
		if (Number.isFinite(x) && Number.isFinite(y)) {
			pairs.push({ x, y });
		}
	}
	return pairs;
}

export function parseIosRawInputEvents(rawContent: string): ParsedRawEvent[] {
	const lines = rawContent
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0);
	const events: ParsedRawEvent[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const lower = line.toLowerCase();
		const eventMonotonicMs = extractIosLogTimestampMs(line) ?? index * 50;

		if (lower.includes("swipe") || lower.includes("drag")) {
			const pairs = extractCoordinatePairs(line);
			if (pairs.length >= 2) {
				const start = pairs[0];
				const end = pairs[pairs.length - 1];
				events.push({
					type: "swipe",
					eventMonotonicMs,
					x: start.x,
					y: start.y,
					endX: end.x,
					endY: end.y,
					gesture: {
						kind: "swipe",
						start,
						end,
						durationMs: 240,
					},
					rawLine: line,
				});
			}
			continue;
		}

		if (lower.includes("tap") || lower.includes("touch")) {
			const pair = extractCoordinatePairs(line)[0];
			events.push({
				type: "tap",
				eventMonotonicMs,
				x: pair?.x,
				y: pair?.y,
				gesture: pair
					? {
							kind: "tap",
							start: pair,
							end: pair,
							durationMs: 60,
						}
					: undefined,
				rawLine: line,
			});
			continue;
		}

		if (
			lower.includes("keyboard") ||
			lower.includes("insert") ||
			lower.includes("typing") ||
			lower.includes("text")
		) {
			const quoted =
				line.match(/["']([^"'\n]+)["']/)?.[1] ??
				line.match(/(?:text|value|insert)[=:]\s*([^,;]+)/i)?.[1]?.trim();
			if (!quoted || quoted.length === 0) {
				continue;
			}
			events.push({
				type: "type",
				eventMonotonicMs,
				textDelta: quoted,
				rawLine: line,
			});
		}
	}

	return events;
}

export async function startIosCaptureProcesses(
	params: RecordingCaptureStartParams,
): Promise<RecordingCaptureStartResult> {
	if (params.dryRun) {
		return {};
	}
	const idbProbe = await probeIdbAvailability(params.repoRoot);
	if (!idbProbe || idbProbe.exitCode !== 0) {
		return {
			failureSuggestion:
				"iOS recording requires idb + idb_companion. Install and verify with `idb list-targets`, then retry start_record_session.",
		};
	}

	const iosLogStreamPredicate =
		"eventMessage CONTAINS[c] 'touch' OR eventMessage CONTAINS[c] 'tap' OR eventMessage CONTAINS[c] 'keyboard' OR eventMessage CONTAINS[c] 'swipe'";
	const shellCommand = `xcrun simctl spawn ${shellEscape(params.deviceId)} log stream --style compact --level info --predicate ${shellEscape(iosLogStreamPredicate)} > ${shellEscape(params.rawEventsAbsolutePath)} 2>&1`;
	const pid = spawnDetachedShell(shellCommand, params.repoRoot, process.env);
	if (!pid) {
		return {
			failureSuggestion:
				"Failed to start iOS simulator event capture. Ensure xcrun simctl works and simulator is booted, then retry.",
		};
	}

	const snapshotDirRelativePath = path.posix.join(
		"artifacts",
		"record-snapshots",
		params.recordSessionId,
	);
	const snapshotDirAbsolutePath = path.resolve(
		params.repoRoot,
		snapshotDirRelativePath,
	);
	await mkdir(snapshotDirAbsolutePath, { recursive: true });
	const describeCommand = buildIosUiDescribeCommand(params.deviceId)
		.map((segment) => shellEscape(segment))
		.join(" ");
	const snapshotLoop = `while true; do ts=$(date +%s%3N); local_path=${shellEscape(path.join(snapshotDirAbsolutePath, `${params.recordSessionId}-$ts.json`))}; ${describeCommand} > $local_path 2>/dev/null; sleep 0.7; done`;
	const snapshotPid = spawnDetachedShell(
		snapshotLoop,
		params.repoRoot,
		process.env,
	);
	return { pid, snapshotPid };
}

export function createIosRecordingHooks(): RecordingPlatformHooks {
	return {
		platform: "ios",
		captureChannels: ["simulator_logs", "ui_snapshots", "app_context"],
		resolveDeviceId: resolveIosRecordingDeviceId,
		readCaptureStartMonotonicMs: async () => undefined,
		startCaptureProcesses: startIosCaptureProcesses,
		captureContextSnapshot: captureIosContextSnapshot,
		parseRawEvents: parseIosRawInputEvents,
		unavailableDeviceSuggestion:
			"No available iOS simulator detected. Boot a simulator first (xcrun simctl list devices), then retry start_record_session.",
		startSuccessSuggestions: [
			"Perform manual interactions on iOS simulator, then call end_record_session with the returned recordSessionId.",
			"If event capture stays empty, verify simulator logs with `xcrun simctl spawn <udid> log stream --style compact`.",
		],
		runningStatusSuggestions: [
			"Continue interacting on iOS simulator, then call end_record_session to export flow.",
			"If rawEventCount remains 0, confirm idb/simctl capture dependencies via doctor.",
		],
		endSessionNoFlowSuggestion:
			"No flow was exported. Verify iOS simulator event capture (touch/keyboard) and idb snapshot availability, then retry recording.",
		cancelSuggestion:
			"iOS recording cancelled. Start a new session after confirming simulator and idb readiness.",
	};
}
