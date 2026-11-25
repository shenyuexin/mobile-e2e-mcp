import { TOOL_NAMES, type DoctorData, type DoctorInput, type ToolResult } from "@mobile-e2e-mcp/contracts";
import type { MobileE2EMcpServer } from "../server.js";

export interface DoctorCommandOptions {
  json: boolean;
  includeUnavailable: boolean;
  help: boolean;
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
        lines.push(`      install: ${cmd}`);
      }
      for (const cmd of item.verifyCommands) {
        lines.push(`      verify:  ${cmd}`);
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
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatDoctorReport(result));
  }

  return result.status === "failed" ? 1 : 0;
}
