/**
 * Unified output path constants for the mobile-e2e-mcp harness.
 *
 * All outputs go under `output/` with three top-level roots:
 * - `output/evidence/` — session/action/diagnostic artifacts
 * - `output/reports/` — structured JSON + MD summaries
 * - `output/tmp/` — ephemeral/debug files
 *
 * This module is the single source of truth for output paths.
 * Existing `artifacts/` and `reports/` directories remain untouched
 * until Phase 2 migration.
 */

// ─── Root constants ──────────────────────────────────────────────────────

export const OUTPUT_ROOT = "output";
export const EVIDENCE_ROOT = "output/evidence";
export const REPORTS_ROOT = "output/reports";
export const TMP_ROOT = "output/tmp";
export const LEGACY_ARTIFACTS_ROOT = "artifacts";
export const LEGACY_REPORTS_ROOT = "reports";

// ─── Evidence sub-paths ──────────────────────────────────────────────────

export const evidencePaths = {
  actions: () => `${EVIDENCE_ROOT}/actions`,
  screenshots: () => `${EVIDENCE_ROOT}/screenshots`,
  sessions: () => `${EVIDENCE_ROOT}/sessions`,
  recordings: () => `${EVIDENCE_ROOT}/recordings`,
  recordSnapshots: () => `${EVIDENCE_ROOT}/recordings/snapshots`,
  recordEvents: () => `${EVIDENCE_ROOT}/recordings/events`,
  recordVideos: () => `${EVIDENCE_ROOT}/recordings/videos`,
  performance: () => `${EVIDENCE_ROOT}/performance`,
  performanceTraces: () => `${EVIDENCE_ROOT}/performance/traces`,
  diagnostics: () => `${EVIDENCE_ROOT}/diagnostics`,
  uiDumps: () => `${EVIDENCE_ROOT}/ui-dumps`,
  crashSignals: () => `${EVIDENCE_ROOT}/crash-signals`,
  logs: () => `${EVIDENCE_ROOT}/logs`,
  stateSummaries: () => `${EVIDENCE_ROOT}/state-summaries`,
  debugEvidence: () => `${EVIDENCE_ROOT}/debug-evidence`,
  elementScreenshots: () => `${EVIDENCE_ROOT}/element-screenshots`,
  iosPhysicalActions: () => `${EVIDENCE_ROOT}/ios-physical-actions`,
  maestroActions: () => `${EVIDENCE_ROOT}/maestro-actions`,
  explorer: () => `${EVIDENCE_ROOT}/explorer`,
  leases: () => `${EVIDENCE_ROOT}/leases`,
  scheduler: () => `${EVIDENCE_ROOT}/scheduler`,
  runFlow: () => `${EVIDENCE_ROOT}/run-flow`,
  mcpServer: () => `${EVIDENCE_ROOT}/mcp-server`,
  recordedSteps: () => `${EVIDENCE_ROOT}/recorded-steps`,
  recordSessions: () => `${EVIDENCE_ROOT}/record-sessions`,
  aiFirst: () => `${EVIDENCE_ROOT}/ai-first`,
  demo: () => `${EVIDENCE_ROOT}/demo`,
  recovery: () => `${EVIDENCE_ROOT}/recovery`,
  debug: () => `${EVIDENCE_ROOT}/debug`,
  misc: () => `${EVIDENCE_ROOT}/misc`,
} as const;

// ─── Report sub-paths ────────────────────────────────────────────────────

export const reportPaths = {
  probes: () => `${REPORTS_ROOT}/probes`,
  acceptance: () => `${REPORTS_ROOT}/acceptance`,
  validation: () => `${REPORTS_ROOT}/validation`,
  explorer: () => `${REPORTS_ROOT}/explorer`,
} as const;

// ─── Tmp sub-paths ───────────────────────────────────────────────────────

export const tmpPaths = {
  manual: () => `${TMP_ROOT}/manual`,
  emulatorValidation: () => `${TMP_ROOT}/emulator-validation`,
  phaseMarkers: () => `${TMP_ROOT}/phase-markers`,
} as const;
