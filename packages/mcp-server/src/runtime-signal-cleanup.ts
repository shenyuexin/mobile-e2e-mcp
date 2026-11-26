import process from "node:process";
import { forceCleanupAllRuntimeResourcesSync } from "@mobile-e2e-mcp/adapter-maestro";

export const SIGNAL_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
} as const;

type SignalName = keyof typeof SIGNAL_EXIT_CODES;

export interface SignalTarget {
  on(event: SignalName, listener: () => void): unknown;
  off(event: SignalName, listener: () => void): unknown;
}

export interface InstallRuntimeSignalCleanupOptions {
  cleanup?: () => void;
  exit?: (code: number) => void;
  targetProcess?: SignalTarget;
}

let defaultSignalCleanupInstalled = false;

/**
 * Register synchronous SIGINT/SIGTERM cleanup handlers that kill active child
 * workers/recordings and exit with standard signal codes (130 / 143).
 *
 * When invoked against the global `process`, registration is idempotent so
 * calling it from both `bin-stdio.ts` and `mcp-stdio-server.ts` adds only one
 * pair of listeners.
 */
export function installRuntimeSignalCleanupHandlers(
  options: InstallRuntimeSignalCleanupOptions = {},
): () => void {
  const isDefaultProcess = !options.targetProcess;
  if (isDefaultProcess && defaultSignalCleanupInstalled) {
    return () => {};
  }

  const targetProcess: SignalTarget = options.targetProcess ?? process;
  const cleanup = options.cleanup ?? forceCleanupAllRuntimeResourcesSync;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  if (isDefaultProcess) {
    defaultSignalCleanupInstalled = true;
  }

  let handled = false;
  const handleSignal = (signal: SignalName): void => {
    if (handled) {
      return;
    }
    handled = true;
    try {
      cleanup();
    } catch {
      // Best-effort synchronous cleanup on signal termination
    }
    exit(SIGNAL_EXIT_CODES[signal]);
  };

  const onSigInt = () => handleSignal("SIGINT");
  const onSigTerm = () => handleSignal("SIGTERM");

  targetProcess.on("SIGINT", onSigInt);
  targetProcess.on("SIGTERM", onSigTerm);

  return () => {
    targetProcess.off("SIGINT", onSigInt);
    targetProcess.off("SIGTERM", onSigTerm);
  };
}
