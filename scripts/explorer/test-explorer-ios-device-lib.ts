export type IosDeviceExplorerMode = "smoke" | "full";

export interface IosDeviceExplorerScriptConfig {
  mode: IosDeviceExplorerMode;
  appId: string;
  deviceId: string;
  outputDir: string;
  maxDepth: string;
  timeoutMs: string;
}

type EnvLike = Record<string, string | undefined>;

function readEnv(env: EnvLike, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function parseIosDeviceExplorerScriptConfig(
  argv: string[],
  env: EnvLike = process.env,
): IosDeviceExplorerScriptConfig {
  const mode: IosDeviceExplorerMode = argv[0] === "full" ? "full" : "smoke";
  const deviceId = readEnv(env, "IOS_DEVICE_ID") ?? readEnv(env, "M2E_DEVICE_ID");
  if (!deviceId) {
    throw new Error(
      "IOS_DEVICE_ID or M2E_DEVICE_ID is required for iOS physical-device Explorer traversal.",
    );
  }

  return {
    mode,
    appId: readEnv(env, "APP_ID") ?? "com.apple.Preferences",
    deviceId,
    outputDir: readEnv(env, "EXPLORER_OUTPUT_DIR")
      ?? (mode === "full" ? "artifacts/explorer/ios-device-full" : "artifacts/explorer/ios-device-smoke"),
    maxDepth: readEnv(env, "EXPLORER_MAX_DEPTH") ?? (mode === "full" ? "8" : "5"),
    timeoutMs: readEnv(env, "EXPLORER_TIMEOUT_MS") ?? (mode === "full" ? "7200000" : "3600000"),
  };
}

export function buildIosDeviceExplorerCliArgs(config: IosDeviceExplorerScriptConfig): string[] {
  return [
    "--mode", config.mode,
    "--app-id", config.appId,
    "--platform", "ios-device",
    "--no-prompt",
    "--output", config.outputDir,
    "--max-depth", config.maxDepth,
    "--timeout-ms", config.timeoutMs,
  ];
}

export function renderIosDeviceExplorerHelp(): string {
  return `Explorer harness for iOS physical devices, including connected iPad Settings traversal.

Run:
  IOS_DEVICE_ID=<iPad-UDID> IOS_EXECUTION_BACKEND=wda pnpm exec tsx scripts/explorer/test-explorer-ios-device.ts [smoke|full]

Required real-device setup:
  1. Connect the iPhone/iPad over USB and trust this computer.
  2. Build and run WebDriverAgent on the device.
  3. Forward WDA locally: iproxy 8100 8100 --udid <iPad-UDID>
  4. Verify WDA: curl http://localhost:8100/status

Optional env vars:
  IOS_DEVICE_ID=<iPad-UDID>          Preferred physical-device UDID input.
  M2E_DEVICE_ID=<iPad-UDID>          Explorer runner device id fallback.
  APP_ID=com.apple.Preferences       Target app; defaults to iOS Settings.
  EXPLORER_OUTPUT_DIR=artifacts/...  Report output directory.
  EXPLORER_MAX_DEPTH=5               Traversal depth override.
  EXPLORER_TIMEOUT_MS=3600000        Total timeout override.
  IOS_EXECUTION_BACKEND=wda          Physical UI hierarchy/action backend.

Equivalent Explorer target:
  --platform ios-device --app-id com.apple.Preferences
`;
}
