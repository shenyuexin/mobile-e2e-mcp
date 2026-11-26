import assert from "node:assert/strict";
import test from "node:test";
import type { DoctorData, ToolResult } from "@mobile-e2e-mcp/contracts";
import {
  AXE_MIN_VERSION,
  buildVersionWarnings,
  executeDoctor,
  formatDoctorReport,
  parseAxeVersion,
} from "../src/cli/doctor-command.ts";

function doctorResult(axeDetail: string): ToolResult<DoctorData> {
  return {
    status: "success",
    reasonCode: "OK",
    sessionId: "doctor-version",
    durationMs: 1,
    attempts: 1,
    artifacts: [],
    data: {
      checks: [{ name: "axe", status: "pass", detail: axeDetail }],
      devices: { android: [], ios: [] },
      guidance: [
        {
          dependency: "axe",
          status: "warn",
          platformScope: "ios",
          installCommands: ["brew install cameroncooke/axe/axe"],
          verifyCommands: ["axe --version"],
          envHints: [],
        },
      ],
    },
    nextSuggestions: [],
  };
}

test("parseAxeVersion extracts semver triples from axe --version output", () => {
  assert.equal(parseAxeVersion("axe 2.1.0"), "2.1.0");
  assert.equal(parseAxeVersion("axe version 2.2.4 (build 7)"), "2.2.4");
  assert.equal(parseAxeVersion("axe not found"), undefined);
  assert.equal(AXE_MIN_VERSION, "2.2.0");
});

test("doctor warns with a copy-pasteable upgrade command for axe < 2.2.0", () => {
  const oldAxe = doctorResult("axe 2.1.0");
  const report = formatDoctorReport(oldAxe);
  assert.match(report, /AXe version warning/);
  assert.match(report, /2\.1\.0 is older than v2\.2\.0/);
  assert.match(report, /perform_gesture and axe serve require/);
  assert.match(report, /\$ brew upgrade cameroncooke\/axe\/axe/);
  assert.match(report, /\$ axe --version/);
  assert.match(report, /\$ brew install cameroncooke\/axe\/axe/);

  assert.equal(buildVersionWarnings(oldAxe).length > 0, true);
  assert.deepEqual(buildVersionWarnings(doctorResult("axe 2.2.0")), []);
  assert.doesNotMatch(formatDoctorReport(doctorResult("axe 2.2.0")), /AXe version warning/);
});

test("doctor --json includes machine-readable version warnings", async () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  try {
    const server = {
      invoke: async () => doctorResult("axe 2.1.3"),
    } as never;
    assert.equal(await executeDoctor(server, ["--json"]), 0);
    const payload = JSON.parse(lines.join("\n")) as {
      versionWarnings?: string[];
      status: string;
    };
    assert.equal(payload.status, "success");
    assert.equal(payload.versionWarnings?.[0]?.includes("2.1.3"), true);
  } finally {
    console.log = originalLog;
  }
});
