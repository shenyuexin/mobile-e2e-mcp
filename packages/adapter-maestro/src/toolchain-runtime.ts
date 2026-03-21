import path from "node:path";
import { isDarwinHost, resolveExecutable } from "./host-runtime.js";

const PREFERRED_IDB_CLI_PATHS = [
  path.join(process.env.HOME ?? "", "Library", "Python", "3.9", "bin", "idb"),
  "/opt/homebrew/bin/idb",
  "/usr/local/bin/idb",
];

const PREFERRED_IDB_COMPANION_PATHS = [
  "/opt/homebrew/bin/idb_companion",
  "/usr/local/bin/idb_companion",
];

const PREFERRED_TRACE_PROCESSOR_PATHS = [
  path.join(process.env.HOME ?? "", ".local", "bin", "trace_processor"),
  "/opt/homebrew/bin/trace_processor",
  "/usr/local/bin/trace_processor",
];

export interface OcrHostSupportSummary {
  supported: boolean;
  defaultProvider?: string;
  configuredProviders: string[];
}

export function resolveIdbCliPath(): string | undefined {
  return resolveExecutable({
    configuredValue: process.env.IDB_CLI_PATH,
    fallbackExecutableName: "idb",
    preferredPaths: PREFERRED_IDB_CLI_PATHS,
    configuredLabel: "IDB_CLI_PATH",
  });
}

export function resolveIdbCompanionPath(): string | undefined {
  return resolveExecutable({
    configuredValue: process.env.IDB_COMPANION_PATH,
    fallbackExecutableName: "idb_companion",
    preferredPaths: PREFERRED_IDB_COMPANION_PATHS,
    configuredLabel: "IDB_COMPANION_PATH",
  });
}

export function resolveTraceProcessorPath(): string | undefined {
  return resolveExecutable({
    configuredValue: process.env.TRACE_PROCESSOR_PATH,
    fallbackExecutableName: "trace_processor",
    preferredPaths: PREFERRED_TRACE_PROCESSOR_PATHS,
    configuredLabel: "TRACE_PROCESSOR_PATH",
  });
}

export function buildOcrHostSupportSummary(): OcrHostSupportSummary {
  const supported = isDarwinHost();
  return {
    supported,
    defaultProvider: supported ? "mac-vision" : undefined,
    configuredProviders: supported ? ["mac-vision"] : [],
  };
}
