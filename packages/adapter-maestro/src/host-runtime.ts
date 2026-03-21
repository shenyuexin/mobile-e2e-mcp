import { existsSync } from "node:fs";
import path from "node:path";

export interface ExecutableResolutionInput {
  configuredValue?: string;
  fallbackExecutableName: string;
  preferredPaths?: string[];
  configuredLabel?: string;
}

export interface HostRuntimeSummary {
  platform: NodeJS.Platform;
  isDarwin: boolean;
}

export function resolveExecutableFromPath(executableName: string): string | undefined {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }

  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) {
      continue;
    }
    const candidate = path.join(entry, executableName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveConfiguredExecutable(configuredValue: string | undefined, fallbackExecutableName: string, configuredLabel?: string): string | undefined {
  if (configuredValue) {
    if (configuredValue.includes(path.sep)) {
      if (!existsSync(configuredValue)) {
        throw new Error(`Configured ${configuredLabel ?? fallbackExecutableName} path for ${fallbackExecutableName} does not exist: ${configuredValue}`);
      }
      return configuredValue;
    }
    const resolvedConfiguredValue = resolveExecutableFromPath(configuredValue);
    if (!resolvedConfiguredValue) {
      throw new Error(`Configured ${configuredLabel ?? fallbackExecutableName} executable for ${fallbackExecutableName} was not found on PATH: ${configuredValue}`);
    }
    return resolvedConfiguredValue;
  }

  return resolveExecutableFromPath(fallbackExecutableName);
}

export function resolveExecutable(input: ExecutableResolutionInput): string | undefined {
  if (input.configuredValue) {
    return resolveConfiguredExecutable(input.configuredValue, input.fallbackExecutableName, input.configuredLabel);
  }

  for (const candidate of input.preferredPaths ?? []) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return resolveConfiguredExecutable(undefined, input.fallbackExecutableName, input.configuredLabel);
}

export function isDarwinHost(): boolean {
  return process.platform === "darwin";
}

export function buildHostRuntimeSummary(): HostRuntimeSummary {
  return {
    platform: process.platform,
    isDarwin: isDarwinHost(),
  };
}
