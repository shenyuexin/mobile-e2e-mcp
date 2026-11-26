import { TOOL_NAMES, type DoctorData, type DoctorInput, type ToolResult } from "@mobile-e2e-mcp/contracts";
import type { MobileE2EMcpServer } from "../server.js";

export interface DoctorCommandOptions {
  json: boolean;
  includeUnavailable: boolean;
  help: boolean;
}

/** Minimum AXe version required for perform_gesture and `axe serve`. */
export const AXE_MIN_VERSION = "2.2.0";
export const AXE_UPGRADE_COMMAND = "brew upgrade cameroncooke/axe/axe";

/** Extract a semver triple from an `axe --version` detail string. */
export function parseAxeVersion(detail: string): string | undefined {
  const match = /\b(\d+)\.(\d+)\.(\d+)\b/.exec(detail ?? "");
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string): number[] => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

/** Machine-readable AXe version warnings derived from doctor checks. */
export function buildVersionWarnings(result: ToolResult<DoctorData>): string[] {
  const axeCheck = result.data?.checks?.find((check) => check.name.toLowerCase() === "axe");
  const version = axeCheck ? parseAxeVersion(axeCheck.detail) : undefined;
  if (!version || compareSemver(version, AXE_MIN_VERSION) >= 0) return [];
  return [
    `AXe ${version} is older than v${AXE_MIN_VERSION}; perform_gesture and axe serve require v2.2+.`,
    `Upgrade: ${AXE_UPGRADE_COMMAND}`,
    "Verify: axe --version",
  ];
}

function printDoctorHelp(): void {
  console.log(`Usage: mobile-e2e-mcp doctor [options]

Check local Android/iOS toolchains, booted devices, and host readiness.

Options:
  --json                 Print raw structured JSON result
  --include-unavailable  Include unavailable / offline devices in output
  --help, -h             Show this help message`);
}

export function parseDoctorArgs(argv: string[]): DoctorCommandOptions {
  return {
    json: argv.includes("--json"),
    includeUnavailable: argv.includes("--include-unavailable"),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export function formatDoctorReport(result: ToolResult<DoctorData>): string {
  const lines: string[] = [];
  lines.push(`mobile-e2e-mcp doctor — status: ${result.status} (${result.reasonCode})`);
  lines.push("");

  lines.push("Environment checks:");
  for (const check of result.data.checks) {
    const tag = check.status.toUpperCase().padEnd(4, " ");
    lines.push(`  [${tag}] ${check.name}: ${check.detail}`);
  }

  const versionWarnings = buildVersionWarnings(result);
  if (versionWarnings.length > 0) {
    lines.push("");
    lines.push(`AXe version warning (minimum v${AXE_MIN_VERSION}):`);
    for (const warning of versionWarnings) lines.push(`  ${warning}`);
    lines.push(`  $ ${AXE_UPGRADE_COMMAND}`);
    lines.push("  $ axe --version");
  }

  lines.push("");
  const androidDevices = result.data.devices?.android ?? [];
  const iosDevices = result.data.devices?.ios ?? [];
  lines.push(`Devices detected: Android=${androidDevices.length}, iOS=${iosDevices.length}`);
  for (const device of androidDevices) {
    lines.push(`  - [android] ${device.id}${device.name ? ` (${device.name})` : ""} state=${device.state ?? "unknown"}`);
  }
  for (const device of iosDevices) {
    lines.push(`  - [ios]     ${device.id}${device.name ? ` (${device.name})` : ""} state=${device.state ?? "unknown"}`);
  }

  const actionableGuidance = (result.data.guidance ?? []).filter((item) => item.status !== "pass");
  if (actionableGuidance.length > 0) {
    lines.push("");
    lines.push("Remediation guidance:");
    for (const item of actionableGuidance) {
      lines.push(`  * ${item.dependency} [${item.platformScope}] (${item.status})`);
      for (const cmd of item.installCommands) {
        lines.push(`      $ ${cmd}`);
      }
      for (const cmd of item.verifyCommands) {
        lines.push(`      $ ${cmd}`);
      }
      for (const hint of item.envHints) {
        lines.push(`      hint:    ${hint}`);
      }
    }
  }

  if (result.nextSuggestions.length > 0) {
    lines.push("");
    lines.push("Next suggestions:");
    for (const suggestion of result.nextSuggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return lines.join("\n");
}

export async function executeDoctor(
  server: MobileE2EMcpServer,
  argv: string[],
): Promise<number> {
  const options = parseDoctorArgs(argv);
  if (options.help) {
    printDoctorHelp();
    return 0;
  }

  const result = await server.invoke(TOOL_NAMES.doctor, {
    includeUnavailable: options.includeUnavailable,
  } satisfies DoctorInput);

  if (options.json) {
    const versionWarnings = buildVersionWarnings(result);
    console.log(JSON.stringify(
      versionWarnings.length > 0 ? { ...result, versionWarnings } : result,
      null,
      2,
    ));
  } else {
    console.log(formatDoctorReport(result));
  }

  return result.status === "failed" ? 1 : 0;
}
