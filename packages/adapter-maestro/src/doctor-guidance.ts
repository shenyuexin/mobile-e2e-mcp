import type { DoctorCheck } from "@mobile-e2e-mcp/contracts";

function hasFailingIdbSignal(checks: DoctorCheck[]): boolean {
  return checks.some((check) => {
    if (check.status === "pass") {
      return false;
    }
    const name = check.name.toLowerCase();
    return name.includes("idb");
  });
}

export function buildDoctorNextSuggestions(checks: DoctorCheck[]): string[] {
  const suggestions = checks
    .filter((check) => check.status !== "pass")
    .map((check) => `Resolve ${check.name}: ${check.detail}`);

  if (!hasFailingIdbSignal(checks)) {
    return suggestions;
  }

  const idbInstallHints = [
    "Install idb CLI: pipx install fb-idb (or: pip3 install --user fb-idb).",
    "Install idb companion on macOS: brew install idb-companion.",
    "Verify idb setup: which idb && which idb_companion && idb list-targets.",
    "If binaries are in non-standard locations, set IDB_CLI_PATH and IDB_COMPANION_PATH before rerunning doctor.",
  ];

  return [...new Set([...suggestions, ...idbInstallHints])];
}
