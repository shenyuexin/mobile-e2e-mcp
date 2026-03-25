import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type {
  InspectUiData,
  InspectUiInput,
  QueryUiData,
  QueryUiInput,
  QueryUiMatch,
  ResolveUiTargetData,
  ResolveUiTargetInput,
  ToolResult,
  WaitForUiData,
  WaitForUiInput,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import {
  buildDefaultDeviceId,
  DEFAULT_HARNESS_CONFIG_PATH,
  DEFAULT_RUNNER_PROFILE,
  loadHarnessSelection,
  resolveRepoPath,
} from "./harness-config.js";
import {
  buildInspectUiSummary,
  buildNonExecutedUiTargetResolution,
  buildUiTargetResolution,
  hasQueryUiSelector,
  isWaitConditionMet,
  parseAndroidUiHierarchyNodes,
  parseInspectUiSummary,
  parseIosInspectSummary,
  queryUiNodes,
  reasonCodeForResolutionStatus,
  shouldAbortWaitForUiAfterReadFailure,
} from "./ui-model.js";
import {
  type AndroidUiSnapshot,
  type AndroidUiSnapshotFailure,
  type IosUiSnapshot,
  type IosUiSnapshotFailure,
  buildAndroidUiDumpCommands,
  captureAndroidUiSnapshot,
  captureIosUiSnapshot,
  isAndroidUiSnapshotFailure,
  isIosUiSnapshotFailure,
} from "./ui-runtime.js";
import { resolveUiRuntimePlatformHooks } from "./ui-runtime-platform.js";
import {
  buildExecutionEvidence,
  buildFailureReason,
  executeRunner,
  toRelativePath,
} from "./runtime-shared.js";
import {
  buildMissingPlatformSuggestion,
  buildPlatformUiDumpOutputPath,
  buildUiQuery,
  buildUnknownUiDumpOutputPath,
} from "./ui-tool-shared.js";
import {
  buildResolutionNextSuggestions,
  DEFAULT_WAIT_INTERVAL_MS,
  DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
  DEFAULT_WAIT_TIMEOUT_MS,
  normalizeWaitForUiMode,
  reasonCodeForWaitTimeout,
} from "./ui-tool-utils.js";

export async function inspectUiWithMaestroTool(
  input: InspectUiInput,
): Promise<ToolResult<InspectUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        command: [],
        exitCode: null,
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("inspect_ui")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const relativeOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
  });
  const absoluteOutputPath = path.resolve(repoRoot, relativeOutputPath);

  if (platform === "ios") {
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: relativeOutputPath,
          command: idbCommand,
          exitCode: 0,
          supportLevel: "partial",
          evidence: [
            buildExecutionEvidence(
              "ui_dump",
              relativeOutputPath,
              "partial",
              "Planned iOS UI hierarchy artifact path.",
            ),
          ],
          platformSupportNote:
            "iOS inspect_ui captures hierarchy through idb; query and action parity remain partial.",
        },
        nextSuggestions: [
          "Run inspect_ui without dryRun to capture an actual iOS hierarchy dump through idb.",
        ],
      };
    }

    const idbProbe = await runtimeHooks.probeRuntimeAvailability?.(repoRoot);
    if (!idbProbe || idbProbe.exitCode !== 0) {
      return {
        status: "partial",
        reasonCode: runtimeHooks.probeFailureReasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: relativeOutputPath,
          command: idbCommand,
          exitCode: idbProbe?.exitCode ?? null,
          supportLevel: "partial",
          platformSupportNote:
            "iOS inspect_ui depends on idb availability in the local environment.",
        },
        nextSuggestions: [runtimeHooks.probeUnavailableSuggestion("inspect_ui")],
      };
    }

    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    const idbExecution = await executeRunner(idbCommand, repoRoot, process.env);
    if (idbExecution.exitCode === 0) {
      await writeFile(absoluteOutputPath, idbExecution.stdout, "utf8");
    }

    return {
      status: idbExecution.exitCode === 0 ? "success" : "partial",
      reasonCode:
        idbExecution.exitCode === 0
          ? REASON_CODES.ok
          : REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts:
        idbExecution.exitCode === 0
          ? [toRelativePath(repoRoot, absoluteOutputPath)]
          : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        command: idbCommand,
        exitCode: idbExecution.exitCode,
        supportLevel: "partial",
        evidence:
          idbExecution.exitCode === 0
            ? [
                buildExecutionEvidence(
                  "ui_dump",
                  relativeOutputPath,
                  "partial",
                  "Captured iOS UI hierarchy artifact.",
                ),
              ]
            : undefined,
        platformSupportNote:
          "iOS inspect_ui can capture hierarchy artifacts, but downstream query/action tooling is still partial compared with Android.",
        content: idbExecution.exitCode === 0 ? idbExecution.stdout : undefined,
        summary:
          idbExecution.exitCode === 0
            ? parseIosInspectSummary(idbExecution.stdout)
            : undefined,
      },
      nextSuggestions:
        idbExecution.exitCode === 0
          ? []
          : [
              "Ensure idb companion is available for the selected simulator and retry inspect_ui.",
            ],
    };
  }

  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: relativeOutputPath,
        command: [...dumpCommand, ...readCommand],
        exitCode: 0,
        supportLevel: "full",
        evidence: [
          buildExecutionEvidence(
            "ui_dump",
            relativeOutputPath,
            "full",
            "Planned Android UI hierarchy artifact path.",
          ),
        ],
      },
      nextSuggestions: [
        "Run inspect_ui without dryRun to capture an actual Android hierarchy dump.",
      ],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(
        dumpExecution.stderr,
        dumpExecution.exitCode,
      ),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: relativeOutputPath,
        command: dumpCommand,
        exitCode: dumpExecution.exitCode,
        supportLevel: "full",
      },
      nextSuggestions: [
        "Check Android device state and ensure uiautomator dump is permitted before retrying inspect_ui.",
      ],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      readExecution.exitCode === 0
        ? REASON_CODES.ok
        : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts:
      readExecution.exitCode === 0
        ? [toRelativePath(repoRoot, absoluteOutputPath)]
        : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: relativeOutputPath,
      command: readCommand,
      exitCode: readExecution.exitCode,
      supportLevel: "full",
      evidence:
        readExecution.exitCode === 0
          ? [
              buildExecutionEvidence(
                "ui_dump",
                relativeOutputPath,
                "full",
                "Captured Android UI hierarchy artifact.",
              ),
            ]
          : undefined,
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary:
        readExecution.exitCode === 0
          ? parseInspectUiSummary(readExecution.stdout)
          : undefined,
    },
    nextSuggestions:
      readExecution.exitCode === 0
        ? []
        : ["Check Android device state before retrying inspect_ui."],
  };
}

export async function queryUiWithMaestroTool(
  input: QueryUiInput,
): Promise<ToolResult<QueryUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("query_ui")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const selection = await loadHarnessSelection(
    repoRoot,
    platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const query = buildUiQuery(input);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
  });

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: [
        "Provide at least one query selector: resourceId, contentDesc, text, className, or clickable.",
      ],
    };
  }

  if (platform === "ios") {
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);

    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [
          "Run query_ui without dryRun to capture an iOS hierarchy artifact and evaluate structured selector matches.",
        ],
      };
    }

    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      input.outputPath,
      {
        sessionId: input.sessionId,
        platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: input.outputPath,
        dryRun: false,
        ...query,
      },
    );
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          query,
          command: snapshot.command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    const result = { query, ...snapshot.queryResult };
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        result,
        supportLevel: "full",
        evidence: [
          buildExecutionEvidence(
            "ui_dump",
            snapshot.relativeOutputPath,
            "full",
            "Captured iOS hierarchy artifact for selector matching.",
          ),
        ],
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions:
        result.totalMatches === 0
          ? [
              "No iOS nodes matched the provided selectors. Broaden the query or inspect the captured hierarchy artifact.",
            ]
          : query.limit !== undefined && result.totalMatches > result.matches.length
            ? [
                "More iOS nodes matched than were returned. Increase query limit or narrow the selector.",
              ]
            : [],
    };
  }

  const absoluteOutputPath = path.resolve(repoRoot, defaultOutputPath);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (input.dryRun) {
    return {
      status: "success",
      reasonCode: REASON_CODES.ok,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
        evidence: [
          buildExecutionEvidence(
            "ui_dump",
            defaultOutputPath,
            "full",
            "Planned Android query_ui hierarchy artifact path.",
          ),
        ],
      },
      nextSuggestions: [
        "Run query_ui without dryRun to capture an Android hierarchy dump and return matched nodes.",
      ],
    };
  }

  const dumpExecution = await executeRunner(dumpCommand, repoRoot, process.env);
  if (dumpExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(
        dumpExecution.stderr,
        dumpExecution.exitCode,
      ),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: dumpExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: [
        "Check Android device state and ensure uiautomator dump is permitted before retrying query_ui.",
      ],
    };
  }

  const readExecution = await executeRunner(readCommand, repoRoot, process.env);
  if (readExecution.exitCode === 0) {
    await writeFile(absoluteOutputPath, readExecution.stdout, "utf8");
  }

  const nodes =
    readExecution.exitCode === 0
      ? parseAndroidUiHierarchyNodes(readExecution.stdout)
      : [];
  const summary =
    readExecution.exitCode === 0
      ? buildInspectUiSummary(nodes)
      : undefined;
  const queryResult =
    readExecution.exitCode === 0
      ? queryUiNodes(nodes, query)
      : { totalMatches: 0, matches: [] as QueryUiMatch[] };

  return {
    status: readExecution.exitCode === 0 ? "success" : "failed",
    reasonCode:
      readExecution.exitCode === 0
        ? REASON_CODES.ok
        : buildFailureReason(readExecution.stderr, readExecution.exitCode),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts:
      readExecution.exitCode === 0
        ? [toRelativePath(repoRoot, absoluteOutputPath)]
        : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: defaultOutputPath,
      query,
      command,
      exitCode: readExecution.exitCode,
      result: { query, ...queryResult },
      supportLevel: "full",
      evidence:
        readExecution.exitCode === 0
          ? [
              buildExecutionEvidence(
                "ui_dump",
                defaultOutputPath,
                "full",
                "Captured Android query_ui hierarchy artifact.",
              ),
            ]
          : undefined,
      content: readExecution.exitCode === 0 ? readExecution.stdout : undefined,
      summary,
    },
    nextSuggestions:
      readExecution.exitCode !== 0
        ? ["Check Android device state before retrying query_ui."]
        : queryResult.totalMatches === 0
          ? [
              "No Android nodes matched the provided selectors. Broaden the query or run inspect_ui to review nearby nodes.",
            ]
          : query.limit !== undefined
              && queryResult.totalMatches > queryResult.matches.length
            ? [
                "More Android nodes matched than were returned. Increase query limit or narrow the selector.",
              ]
            : [],
  };
}

export async function resolveUiTargetWithMaestroTool(
  input: ResolveUiTargetInput,
): Promise<ToolResult<ResolveUiTargetData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "partial"),
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("resolve_ui_target")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = buildUiQuery(input);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
  });

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(
          query,
          platform === "android" ? "full" : "partial",
        ),
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: [
        "Provide at least one selector field before calling resolve_ui_target.",
      ],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);
    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [
          "resolve_ui_target dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to resolve against the current simulator hierarchy.",
        ],
      };
    }

    const snapshot = await captureIosUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      input.outputPath,
      {
        sessionId: input.sessionId,
        platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: input.outputPath,
        dryRun: false,
        ...query,
      },
    );
    if (isIosUiSnapshotFailure(snapshot)) {
      return {
        status: "failed",
        reasonCode: snapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: snapshot.outputPath,
          query,
          command: snapshot.command,
          exitCode: snapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          resolution: buildNonExecutedUiTargetResolution(query, "full"),
          supportLevel: "full",
        },
        nextSuggestions: [snapshot.message],
      };
    }

    const result = { query, ...snapshot.queryResult };
    const resolution = buildUiTargetResolution(query, result, "full");
    return {
      status: resolution.status === "resolved" ? "success" : "partial",
      reasonCode:
        resolution.status === "resolved"
          ? REASON_CODES.ok
          : reasonCodeForResolutionStatus(resolution.status),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts:
        snapshot.execution.exitCode === 0
          ? [toRelativePath(repoRoot, snapshot.absoluteOutputPath)]
          : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.execution.exitCode,
        result,
        resolution,
        supportLevel: "full",
        content: snapshot.execution.stdout,
        summary: snapshot.summary,
      },
      nextSuggestions:
        resolution.status === "resolved"
          ? []
          : buildResolutionNextSuggestions(
              resolution.status,
              "resolve_ui_target",
              resolution,
            ),
    };
  }

  const selection = await loadHarnessSelection(
    repoRoot,
    input.platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [
        "resolve_ui_target dry-run only previews the capture command. Run it without --dry-run to resolve against the live Android hierarchy.",
      ],
    };
  }

  const snapshot = await captureAndroidUiSnapshot(
    repoRoot,
    deviceId,
    input.sessionId,
    runnerProfile,
    input.outputPath,
    {
      sessionId: input.sessionId,
      platform: input.platform,
      runnerProfile,
      harnessConfigPath: input.harnessConfigPath,
      deviceId,
      outputPath: input.outputPath,
      dryRun: false,
      ...query,
    },
  );
  if (isAndroidUiSnapshotFailure(snapshot)) {
    return {
      status: "failed",
      reasonCode: snapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.outputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [snapshot.message],
    };
  }

  if (snapshot.readExecution.exitCode !== 0) {
    return {
      status: "failed",
      reasonCode: buildFailureReason(
        snapshot.readExecution.stderr,
        snapshot.readExecution.exitCode,
      ),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: snapshot.relativeOutputPath,
        query,
        command: snapshot.command,
        exitCode: snapshot.readExecution.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        resolution: buildNonExecutedUiTargetResolution(query, "full"),
        supportLevel: "full",
      },
      nextSuggestions: [
        "Could not read the Android UI hierarchy before resolving the target. Check device state and retry.",
      ],
    };
  }

  const result = { query, ...snapshot.queryResult };
  const resolution = buildUiTargetResolution(query, result, "full");
  return {
    status: resolution.status === "resolved" ? "success" : "partial",
    reasonCode: reasonCodeForResolutionStatus(resolution.status),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [toRelativePath(repoRoot, snapshot.absoluteOutputPath)],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: snapshot.relativeOutputPath,
      query,
      command: snapshot.command,
      exitCode: snapshot.readExecution.exitCode,
      result,
      resolution,
      supportLevel: "full",
      content: snapshot.readExecution.stdout,
      summary: snapshot.summary,
    },
    nextSuggestions:
      resolution.status === "resolved"
        ? []
        : buildResolutionNextSuggestions(
            resolution.status,
            "resolve_ui_target",
            resolution,
          ),
  };
}

export async function waitForUiWithMaestroTool(
  input: WaitForUiInput,
): Promise<ToolResult<WaitForUiData>> {
  const startTime = Date.now();
  if (!input.platform) {
    const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
    const query = buildUiQuery(input);
    const timeoutMs =
      typeof input.timeoutMs === "number" && input.timeoutMs > 0
        ? Math.floor(input.timeoutMs)
        : DEFAULT_WAIT_TIMEOUT_MS;
    const intervalMs =
      typeof input.intervalMs === "number" && input.intervalMs > 0
        ? Math.floor(input.intervalMs)
        : DEFAULT_WAIT_INTERVAL_MS;
    const waitUntil = normalizeWaitForUiMode(input.waitUntil);
    const outputPath = buildUnknownUiDumpOutputPath({
      sessionId: input.sessionId,
      runnerProfile,
      outputPath: input.outputPath,
    });
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "partial",
      },
      nextSuggestions: [buildMissingPlatformSuggestion("wait_for_ui")],
    };
  }
  const repoRoot = resolveRepoPath();
  const platform = input.platform;
  const runtimeHooks = resolveUiRuntimePlatformHooks(platform);
  const runnerProfile = input.runnerProfile ?? DEFAULT_RUNNER_PROFILE;
  const query = buildUiQuery(input);
  const timeoutMs =
    typeof input.timeoutMs === "number" && input.timeoutMs > 0
      ? Math.floor(input.timeoutMs)
      : DEFAULT_WAIT_TIMEOUT_MS;
  const intervalMs =
    typeof input.intervalMs === "number" && input.intervalMs > 0
      ? Math.floor(input.intervalMs)
      : DEFAULT_WAIT_INTERVAL_MS;
  const waitUntil = normalizeWaitForUiMode(input.waitUntil);
  const defaultOutputPath = buildPlatformUiDumpOutputPath({
    sessionId: input.sessionId,
    runnerProfile,
    platform,
    outputPath: input.outputPath,
  });

  if (!hasQueryUiSelector(query)) {
    return {
      status: "failed",
      reasonCode: REASON_CODES.configurationError,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: Boolean(input.dryRun),
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command: [],
        exitCode: null,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: platform === "android" ? "full" : "partial",
      },
      nextSuggestions: [
        "Provide at least one selector field before calling wait_for_ui.",
      ],
    };
  }

  if (platform === "ios") {
    const deviceId = input.deviceId ?? buildDefaultDeviceId(platform);
    const idbCommand = runtimeHooks.buildHierarchyCapturePreviewCommand(deviceId);
    if (input.dryRun) {
      return {
        status: "partial",
        reasonCode: REASON_CODES.unsupportedOperation,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: 1,
        artifacts: [],
        data: {
          dryRun: true,
          runnerProfile,
          outputPath: defaultOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls: 0,
          command: idbCommand,
          exitCode: 0,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [
          "wait_for_ui dry-run only previews the iOS hierarchy capture command. Run it without --dry-run to poll the current simulator hierarchy.",
        ],
      };
    }

    let polls = 0;
    let lastSnapshot: IosUiSnapshot | IosUiSnapshotFailure | undefined;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      polls += 1;
      lastSnapshot = await captureIosUiSnapshot(
        repoRoot,
        deviceId,
        input.sessionId,
        runnerProfile,
        input.outputPath,
        {
          sessionId: input.sessionId,
          platform,
          runnerProfile,
          harnessConfigPath: input.harnessConfigPath,
          deviceId,
          outputPath: input.outputPath,
          dryRun: false,
          ...query,
        },
      );
      if (
        !isIosUiSnapshotFailure(lastSnapshot)
        && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)
      ) {
        return {
          status: "success",
          reasonCode: REASON_CODES.ok,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.execution.exitCode,
            result: { query, ...lastSnapshot.queryResult },
            supportLevel: "full",
            content: lastSnapshot.execution.stdout,
            summary: lastSnapshot.summary,
          },
          nextSuggestions: [],
        };
      }
      if (Date.now() < deadline) {
        await delay(intervalMs);
      }
    }

    if (lastSnapshot && isIosUiSnapshotFailure(lastSnapshot)) {
      return {
        status: "failed",
        reasonCode: lastSnapshot.reasonCode,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.outputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.exitCode,
          result: { query, totalMatches: 0, matches: [] },
          supportLevel: "full",
        },
        nextSuggestions: [lastSnapshot.message],
      };
    }

    const timeoutSnapshot =
      lastSnapshot && !isIosUiSnapshotFailure(lastSnapshot)
        ? lastSnapshot
        : undefined;
    const result = timeoutSnapshot
      ? { query, ...timeoutSnapshot.queryResult }
      : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
    return {
      status: "partial",
      reasonCode: reasonCodeForWaitTimeout(waitUntil),
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: timeoutSnapshot
        ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)]
        : [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: timeoutSnapshot?.command ?? idbCommand,
        exitCode: timeoutSnapshot?.execution.exitCode ?? null,
        result,
        supportLevel: "full",
        content: timeoutSnapshot?.execution.stdout,
        summary: timeoutSnapshot?.summary,
      },
      nextSuggestions: [
        `Timed out waiting for iOS UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`,
      ],
    };
  }

  const selection = await loadHarnessSelection(
    repoRoot,
    input.platform,
    runnerProfile,
    input.harnessConfigPath ?? DEFAULT_HARNESS_CONFIG_PATH,
  );
  const deviceId =
    input.deviceId ?? selection.deviceId ?? buildDefaultDeviceId(platform);
  const { dumpCommand, readCommand } = buildAndroidUiDumpCommands(deviceId);
  const command = [...dumpCommand, ...readCommand];

  if (input.dryRun) {
    return {
      status: "partial",
      reasonCode: REASON_CODES.unsupportedOperation,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: 1,
      artifacts: [],
      data: {
        dryRun: true,
        runnerProfile,
        outputPath: defaultOutputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls: 0,
        command,
        exitCode: 0,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: [
        "wait_for_ui dry-run only previews the capture command. Run it without --dry-run to poll the live Android hierarchy.",
      ],
    };
  }

  let polls = 0;
  let lastSnapshot: AndroidUiSnapshot | AndroidUiSnapshotFailure | undefined;
  let consecutiveCaptureFailures = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    polls += 1;
    lastSnapshot = await captureAndroidUiSnapshot(
      repoRoot,
      deviceId,
      input.sessionId,
      runnerProfile,
      input.outputPath,
      {
        sessionId: input.sessionId,
        platform: input.platform,
        runnerProfile,
        harnessConfigPath: input.harnessConfigPath,
        deviceId,
        outputPath: input.outputPath,
        dryRun: false,
        ...query,
      },
    );
    if (isAndroidUiSnapshotFailure(lastSnapshot)) {
      consecutiveCaptureFailures += 1;
      if (
        shouldAbortWaitForUiAfterReadFailure({
          consecutiveFailures: consecutiveCaptureFailures,
          maxConsecutiveFailures:
            DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
        })
      ) {
        return {
          status: "failed",
          reasonCode: lastSnapshot.reasonCode,
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.outputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [
            `Android UI hierarchy capture failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`,
          ],
        };
      }
    } else if (lastSnapshot.readExecution.exitCode !== 0) {
      consecutiveCaptureFailures += 1;
      if (
        shouldAbortWaitForUiAfterReadFailure({
          consecutiveFailures: consecutiveCaptureFailures,
          maxConsecutiveFailures:
            DEFAULT_WAIT_MAX_CONSECUTIVE_CAPTURE_FAILURES,
        })
      ) {
        return {
          status: "failed",
          reasonCode: buildFailureReason(
            lastSnapshot.readExecution.stderr,
            lastSnapshot.readExecution.exitCode,
          ),
          sessionId: input.sessionId,
          durationMs: Date.now() - startTime,
          attempts: polls,
          artifacts: [],
          data: {
            dryRun: false,
            runnerProfile,
            outputPath: lastSnapshot.relativeOutputPath,
            query,
            timeoutMs,
            intervalMs,
            waitUntil,
            polls,
            command: lastSnapshot.command,
            exitCode: lastSnapshot.readExecution.exitCode,
            result: { query, totalMatches: 0, matches: [] },
            supportLevel: "full",
          },
          nextSuggestions: [
            `Android UI hierarchy reads failed ${String(consecutiveCaptureFailures)} times in a row during wait_for_ui. Check device state and retry instead of waiting for timeout.`,
          ],
        };
      }
    } else {
      consecutiveCaptureFailures = 0;
    }
    if (
      !isAndroidUiSnapshotFailure(lastSnapshot)
      && lastSnapshot.readExecution.exitCode === 0
      && isWaitConditionMet({ query, ...lastSnapshot.queryResult }, waitUntil)
    ) {
      return {
        status: "success",
        reasonCode: REASON_CODES.ok,
        sessionId: input.sessionId,
        durationMs: Date.now() - startTime,
        attempts: polls,
        artifacts: [toRelativePath(repoRoot, lastSnapshot.absoluteOutputPath)],
        data: {
          dryRun: false,
          runnerProfile,
          outputPath: lastSnapshot.relativeOutputPath,
          query,
          timeoutMs,
          intervalMs,
          waitUntil,
          polls,
          command: lastSnapshot.command,
          exitCode: lastSnapshot.readExecution.exitCode,
          result: { query, ...lastSnapshot.queryResult },
          supportLevel: "full",
          content: lastSnapshot.readExecution.stdout,
          summary: lastSnapshot.summary,
        },
        nextSuggestions: [],
      };
    }
    if (Date.now() < deadline) {
      await delay(intervalMs);
    }
  }

  if (lastSnapshot && isAndroidUiSnapshotFailure(lastSnapshot)) {
    return {
      status: "failed",
      reasonCode: lastSnapshot.reasonCode,
      sessionId: input.sessionId,
      durationMs: Date.now() - startTime,
      attempts: polls,
      artifacts: [],
      data: {
        dryRun: false,
        runnerProfile,
        outputPath: lastSnapshot.outputPath,
        query,
        timeoutMs,
        intervalMs,
        waitUntil,
        polls,
        command: lastSnapshot.command,
        exitCode: lastSnapshot.exitCode,
        result: { query, totalMatches: 0, matches: [] },
        supportLevel: "full",
      },
      nextSuggestions: [lastSnapshot.message],
    };
  }

  const timeoutSnapshot =
    !lastSnapshot || isAndroidUiSnapshotFailure(lastSnapshot)
      ? undefined
      : lastSnapshot;
  const result = timeoutSnapshot
    ? { query, ...timeoutSnapshot.queryResult }
    : { query, totalMatches: 0, matches: [] as QueryUiMatch[] };
  return {
    status: "partial",
    reasonCode: reasonCodeForWaitTimeout(waitUntil),
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: polls,
    artifacts: timeoutSnapshot
      ? [toRelativePath(repoRoot, timeoutSnapshot.absoluteOutputPath)]
      : [],
    data: {
      dryRun: false,
      runnerProfile,
      outputPath: timeoutSnapshot?.relativeOutputPath ?? defaultOutputPath,
      query,
      timeoutMs,
      intervalMs,
      waitUntil,
      polls,
      command: timeoutSnapshot?.command ?? command,
      exitCode: timeoutSnapshot?.readExecution.exitCode ?? null,
      result,
      supportLevel: "full",
      content: timeoutSnapshot?.readExecution.stdout,
      summary: timeoutSnapshot?.summary,
    },
    nextSuggestions: [
      `Timed out waiting for Android UI condition '${waitUntil}'. Broaden the selector, change waitUntil, increase timeoutMs, or inspect the latest hierarchy artifact.`,
    ],
  };
}
