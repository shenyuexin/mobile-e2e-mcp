import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuditedArtifactEntries,
  buildSessionAuditRecord,
  collectInterruptionEvents,
  redactSensitiveText,
  type ArtifactGovernanceConfig,
  type SessionAuditSchemaConfig,
  type PersistedSessionRecord,
} from "../../core/src/index.ts";

const governanceConfig: ArtifactGovernanceConfig = {
  retention: {
    "local-dev": {
      screenshots: "14d",
      "debug-output": "7d",
      reports: "30d",
    },
    ci: {
      screenshots: "3d",
      "debug-output": "2d",
      reports: "10d",
    },
  },
  redaction: {
    enabled: true,
    targets: ["token", "password", "phone-number"],
  },
};

const schemaConfig: SessionAuditSchemaConfig = {
  session_audit: {
    required_fields: [
      "session_id",
      "phase",
      "platform",
      "flow_name",
      "result",
      "artifact_paths",
      "interruption_events",
    ],
  },
};

function withCiEnv<T>(value: string | undefined, callback: () => T): T {
  const originalCi = process.env.CI;
  if (value === undefined) {
    delete process.env.CI;
  } else {
    process.env.CI = value;
  }

  try {
    return callback();
  } finally {
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
  }
}

test("redactSensitiveText redacts token password and phone markers", () => {
  const value = "token=abc123 password=hunter2 call +86 138 0013 8000";
  const redacted = redactSensitiveText(value, governanceConfig);

  assert.equal(redacted.includes("abc123"), false);
  assert.equal(redacted.includes("hunter2"), false);
  assert.equal(redacted.includes("138 0013 8000"), false);
  assert.equal(redacted.includes("[REDACTED_TOKEN]"), true);
  assert.equal(redacted.includes("[REDACTED_PASSWORD]"), true);
  assert.equal(redacted.includes("[REDACTED_PHONE]"), true);
});

test("buildAuditedArtifactEntries classifies artifacts and applies retention profiles", () => {
  const entries = withCiEnv(undefined, () => buildAuditedArtifactEntries([
    "artifacts/screens/login-screenshot.png",
    "artifacts/reports/summary.md",
    "artifacts/debug/session-log.txt",
    "artifacts/misc/archive.bin",
    "artifacts/debug/session-log.txt",
  ], governanceConfig));

  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((entry) => entry.category), [
    "screenshots",
    "reports",
    "debug-output",
    "other",
  ]);
  assert.deepEqual(entries.map((entry) => entry.retention), [
    "14d",
    "30d",
    "7d",
    undefined,
  ]);
});

test("buildAuditedArtifactEntries uses CI retention tier and redacts sensitive paths", () => {
  const entries = withCiEnv("true", () => buildAuditedArtifactEntries([
    "artifacts/debug/token-secret-password-reset-+1 415 555 2671.json",
  ], governanceConfig));

  assert.equal(entries[0]?.category, "debug-output");
  assert.equal(entries[0]?.retention, "2d");
  assert.equal(entries[0]?.path.includes("token-secret"), false);
  assert.equal(entries[0]?.path.includes("password-reset"), false);
  assert.equal(entries[0]?.path.includes("415 555 2671"), false);
});

test("collectInterruptionEvents captures explicit and blocking-signal interruptions with redaction", () => {
  const interruptions = collectInterruptionEvents([
    {
      timestamp: "2026-03-11T00:00:00.000Z",
      type: "permission_interruption",
      detail: "dialog requested token abc123",
    },
    {
      timestamp: "2026-03-11T00:00:01.000Z",
      type: "state_summary_captured",
      summary: "waiting",
      stateSummary: {
        appPhase: "unknown",
        readiness: "interrupted",
        blockingSignals: ["permission_prompt"],
        topVisibleTexts: [],
      },
      detail: "phone +44 7700 900123 shown",
    },
    {
      timestamp: "2026-03-11T00:00:02.000Z",
      type: "action_outcome_recorded",
      detail: "safe normal event",
    },
  ], governanceConfig);

  assert.equal(interruptions.length, 2);
  assert.equal(interruptions[0]?.includes("[REDACTED_TOKEN]"), true);
  assert.equal(interruptions[1]?.includes("[REDACTED_PHONE]"), true);
});

test("buildSessionAuditRecord builds redacted classified audit output", () => {
  const record: PersistedSessionRecord = {
    session: {
      sessionId: "audit-session",
      platform: "android",
      deviceId: "emulator-5554",
      appId: "com.example.demo",
      policyProfile: "sample-harness-default",
      startedAt: "2026-03-11T00:00:00.000Z",
      artifactsRoot: "artifacts/phase3-native-android/audit-session",
      timeline: [
        {
          timestamp: "2026-03-11T00:00:00.000Z",
          type: "session_started",
          detail: "started",
        },
        {
          timestamp: "2026-03-11T00:00:01.000Z",
          type: "dialog_interrupt",
          detail: "password=hunter2 blocked the path",
        },
      ],
      phase: "phase3",
      profile: "native_android",
      sampleName: "mobitru-native",
    },
    closed: true,
    endedAt: "2026-03-11T00:03:00.000Z",
    artifacts: [
      "artifacts/screens/final-screenshot.png",
      "artifacts/reports/summary.md",
      "artifacts/debug/token-secret.txt",
    ],
    updatedAt: "2026-03-11T00:03:00.000Z",
  };

  const audit = withCiEnv(undefined, () => buildSessionAuditRecord(record, governanceConfig, schemaConfig));

  assert.equal(audit.session_id, "audit-session");
  assert.equal(audit.flow_name, "mobitru-native");
  assert.equal(audit.result, "completed");
  assert.deepEqual(audit.artifact_paths.map((entry) => entry.category), ["screenshots", "reports", "debug-output"]);
  assert.equal(audit.artifact_paths[2]?.path.includes("token-secret"), false);
  assert.equal(audit.interruption_events[0]?.includes("hunter2"), false);
  assert.deepEqual(audit.schema_required_fields, schemaConfig.session_audit.required_fields);
});
