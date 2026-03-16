import type {
  ActionIntent,
  AndroidPerformancePreset,
  IosPerformanceTemplate,
  Platform,
  ResetAppStateStrategy,
  RunnerProfile,
  UiScrollDirection,
  WaitForUiMode,
} from "@mobile-e2e-mcp/contracts";

export interface CliOptions {
  captureJsConsoleLogs: boolean;
  captureJsNetworkEvents: boolean;
  compareAgainstBaseline: boolean;
  collectDebugEvidence: boolean;
  collectDiagnostics: boolean;
  describeCapabilities: boolean;
  platform: Platform;
  doctor: boolean;
  explainLastFailure: boolean;
  findSimilarFailures: boolean;
  dryRun: boolean;
  getCrashSignals: boolean;
  getActionOutcome: boolean;
  getScreenSummary: boolean;
  getSessionState: boolean;
  includeUnavailable: boolean;
  getLogs: boolean;
  inspectUi: boolean;
  installApp: boolean;
  listJsDebugTargets: boolean;
  launchApp: boolean;
  listDevices: boolean;
  measureAndroidPerformance: boolean;
  measureIosPerformance: boolean;
  performActionWithEvidence: boolean;
  autoRemediate: boolean;
  rankFailureCandidates: boolean;
  recordScreen: boolean;
  recoverToKnownState: boolean;
  replayLastStablePath: boolean;
  resetAppState: boolean;
  queryUi: boolean;
  resolveUiTarget: boolean;
  scrollAndResolveUiTarget: boolean;
  scrollAndTapElement: boolean;
  takeScreenshot: boolean;
  suggestKnownRemediation: boolean;
  tap: boolean;
  tapElement: boolean;
  terminateApp: boolean;
  durationMs?: number;
  resetStrategy?: ResetAppStateStrategy;
  bitrateMbps?: number;
  performancePreset?: AndroidPerformancePreset;
  performanceTemplate?: IosPerformanceTemplate;
  typeText: boolean;
  typeIntoElement: boolean;
  waitForUi: boolean;
  runCount: number;
  artifactPath?: string;
  outputPath?: string;
  lines?: number;
  sinceSeconds?: number;
  jsInspectorTimeoutMs?: number;
  includeDiagnostics?: boolean;
  x?: number;
  y?: number;
  launchUrl?: string;
  appId?: string;
  deviceId?: string;
  queryClassName?: string;
  queryClickable?: boolean;
  queryContentDesc?: string;
  queryLimit?: number;
  queryResourceId?: string;
  queryText?: string;
  text?: string;
  value?: string;
  runnerProfile?: RunnerProfile;
  policyProfile?: string;
  flowPath?: string;
  harnessConfigPath?: string;
  sessionId?: string;
  metroBaseUrl?: string;
  targetId?: string;
  webSocketDebuggerUrl?: string;
  actionId?: string;
  actionType?: ActionIntent["actionType"];
  timeoutMs?: number;
  maxLogs?: number;
  maxEvents?: number;
  failuresOnly?: boolean;
  intervalMs?: number;
  waitUntil?: WaitForUiMode;
  maxSwipes?: number;
  swipeDirection?: UiScrollDirection;
  swipeDurationMs?: number;
  platformProvided: boolean;
  useContextAlias: boolean;
  presetName?: "quick_debug_ios" | "quick_e2e_android" | "crash_triage_android";
}

export type PresetName = NonNullable<CliOptions["presetName"]>;
