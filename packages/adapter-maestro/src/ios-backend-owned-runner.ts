import type {
	BackendProbeResult,
	IosExecutionBackend,
} from "./ios-backend-types.js";

export class OwnedRunnerPhysicalBackend implements IosExecutionBackend {
	readonly backendId = "owned-runner" as const;
	readonly backendName = "iOS Owned XCTest Runner";
	readonly supportLevel = {
		tap: "partial",
		typeText: "partial",
		swipe: "none",
		hierarchy: "partial",
		screenshot: "none",
	} as const;

	async probeAvailability(_repoRoot: string): Promise<BackendProbeResult> {
		return { available: true, version: "owned-runner-action-shell" };
	}

	buildTapCommand(deviceId: string, x: number, y: number): string[] {
		return ["__owned_runner__", deviceId, "tap", JSON.stringify({ x, y })];
	}

	buildTypeTextCommand(deviceId: string, text: string): string[] {
		return [
			"__owned_runner__",
			deviceId,
			"type_text",
			JSON.stringify({ text }),
		];
	}

	buildSwipeCommand(deviceId: string): string[] {
		return ["__owned_runner_unsupported__", deviceId, "swipe"];
	}

	buildHierarchyCaptureCommand(deviceId: string): string[] {
		return ["__owned_runner_hierarchy__", deviceId];
	}

	buildScreenshotCommand(_deviceId: string, _outputPath: string): string[] {
		return [];
	}

	buildFailureSuggestion(action: string, _deviceId: string): string {
		return `Owned iOS runner supports experimental tap/type_text and hierarchy capture for ${action}; use IOS_EXECUTION_BACKEND=wda for full physical-device parity. Screenshot routing is unchanged in this slice.`;
	}
}
