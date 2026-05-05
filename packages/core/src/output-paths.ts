import path from "node:path";

export const CORE_OUTPUT_ROOT = "output";
export const CORE_EVIDENCE_ROOT = path.posix.join(CORE_OUTPUT_ROOT, "evidence");
export const CORE_LEGACY_ARTIFACTS_ROOT = "artifacts";

export const coreEvidencePaths = {
	actions: () => path.posix.join(CORE_EVIDENCE_ROOT, "actions"),
	audit: () => path.posix.join(CORE_EVIDENCE_ROOT, "audit"),
	sessions: () => path.posix.join(CORE_EVIDENCE_ROOT, "sessions"),
	leases: () => path.posix.join(CORE_EVIDENCE_ROOT, "leases"),
	scheduler: () => path.posix.join(CORE_EVIDENCE_ROOT, "scheduler"),
	recordSessions: () => path.posix.join(CORE_EVIDENCE_ROOT, "record-sessions"),
	recordEvents: () => path.posix.join(CORE_EVIDENCE_ROOT, "recordings", "events"),
	recordedSteps: () => path.posix.join(CORE_EVIDENCE_ROOT, "recorded-steps"),
	aiFirst: () => path.posix.join(CORE_EVIDENCE_ROOT, "ai-first"),
} as const;

export const legacyCoreEvidencePaths = {
	actions: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "actions"),
	audit: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "audit"),
	sessions: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "sessions"),
	leases: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "leases"),
	scheduler: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "scheduler"),
	recordSessions: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "record-sessions"),
	recordEvents: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "record-events"),
	recordedSteps: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "recorded-steps"),
	aiFirst: () => path.posix.join(CORE_LEGACY_ARTIFACTS_ROOT, "ai-first"),
} as const;
