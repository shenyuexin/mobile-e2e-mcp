import { randomUUID } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
	ActionIntent,
	ActionOutcomeSummary,
	EvidenceDeltaSummary,
	ExecutionEvidence,
	CheckpointDecisionTrace,
	PostActionVerificationTrace,
	ReasonCode,
	RetryDecisionTrace,
	RetryRecommendation,
	ToolStatus,
} from "@mobile-e2e-mcp/contracts";
import { coreEvidencePaths, legacyCoreEvidencePaths } from "./output-paths.js";
import { persistSessionArtifacts } from "./session-record-store.js";

export interface PersistedActionRecord {
	actionId: string;
	sessionId: string;
	intent?: ActionIntent;
	outcome: ActionOutcomeSummary;
	retryRecommendationTier?:
		| "none"
		| "inspect_only"
		| "refine_selector"
		| "wait_then_retry"
		| "refresh_context"
		| "recover_first"
		| "handoff_required";
	retryRecommendation?: RetryRecommendation;
	retryDecisionTrace?: RetryDecisionTrace;
	postActionVerificationTrace?: PostActionVerificationTrace;
	checkpointDecisionTrace?: CheckpointDecisionTrace;
	actionabilityReview?: string[];
	evidenceDelta: EvidenceDeltaSummary;
	evidence: ExecutionEvidence[];
	lowLevelStatus: ToolStatus;
	lowLevelReasonCode: ReasonCode;
	updatedAt: string;
}

export interface PersistActionRecordResult {
	relativePath?: string;
	updated: boolean;
}

function assertSafeId(input: string): void {
	if (!/^[A-Za-z0-9._-]+$/.test(input)) {
		throw new Error(`Invalid action id for persistence: ${input}`);
	}
}

export function buildActionRecordRelativePath(actionId: string): string {
	assertSafeId(actionId);
	return path.posix.join(coreEvidencePaths.actions(), `${actionId}.json`);
}

function buildLegacyActionRecordRelativePath(actionId: string): string {
	assertSafeId(actionId);
	return path.posix.join(legacyCoreEvidencePaths.actions(), `${actionId}.json`);
}

function buildActionRecordAbsolutePath(repoRoot: string, actionId: string): string {
	return path.resolve(repoRoot, buildActionRecordRelativePath(actionId));
}

function buildActionsRootAbsolutePath(repoRoot: string): string {
	return path.resolve(repoRoot, coreEvidencePaths.actions());
}

function buildLegacyActionsRootAbsolutePath(repoRoot: string): string {
	return path.resolve(repoRoot, legacyCoreEvidencePaths.actions());
}

function buildLegacyActionRecordAbsolutePath(repoRoot: string, actionId: string): string {
	return path.resolve(repoRoot, buildLegacyActionRecordRelativePath(actionId));
}

async function writeJsonFile(absolutePath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(absolutePath), { recursive: true });
	const tempPath = path.join(
		path.dirname(absolutePath),
		`.${path.basename(absolutePath)}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		await rename(tempPath, absolutePath);
	} catch (error: unknown) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

async function writeActionRecord(
	repoRoot: string,
	actionId: string,
	record: PersistedActionRecord,
): Promise<string> {
	const relativePath = buildActionRecordRelativePath(actionId);
	const absolutePath = buildActionRecordAbsolutePath(repoRoot, actionId);
	await writeJsonFile(absolutePath, record);
	return relativePath;
}

export async function loadActionRecord(
	repoRoot: string,
	actionId: string,
): Promise<PersistedActionRecord | undefined> {
	for (const absolutePath of [
		buildActionRecordAbsolutePath(repoRoot, actionId),
		buildLegacyActionRecordAbsolutePath(repoRoot, actionId),
	]) {
		try {
			const content = await readFile(absolutePath, "utf8");
			return JSON.parse(content) as PersistedActionRecord;
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				continue;
			}
			if (error instanceof SyntaxError) {
				return undefined;
			}
			throw error;
		}
	}
	return undefined;
}

export async function loadLatestActionRecordForSession(
	repoRoot: string,
	sessionId: string,
): Promise<PersistedActionRecord | undefined> {
	const records = await listActionRecordsForSession(repoRoot, sessionId);
	return records[0];
}

async function listActionRecordsFromRoot(
	repoRoot: string,
	actionsRoot: string,
	seenActionIds: Set<string>,
): Promise<PersistedActionRecord[]> {
	try {
		const entries = await readdir(actionsRoot, { withFileTypes: true });
		const records: PersistedActionRecord[] = [];

		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".json")) {
				continue;
			}
			const actionId = entry.name.replace(/\.json$/, "");
			if (seenActionIds.has(actionId)) {
				continue;
			}
			seenActionIds.add(actionId);
			let record: PersistedActionRecord | undefined;
			try {
				record = await loadActionRecord(repoRoot, actionId);
			} catch {
				continue;
			}
			if (record) {
				records.push(record);
			}
		}

		return records;
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

export async function listActionRecordsForSession(
	repoRoot: string,
	sessionId: string,
): Promise<PersistedActionRecord[]> {
	const seenActionIds = new Set<string>();
	const records = [
		...(await listActionRecordsFromRoot(
			repoRoot,
			buildActionsRootAbsolutePath(repoRoot),
			seenActionIds,
		)),
		...(await listActionRecordsFromRoot(
			repoRoot,
			buildLegacyActionsRootAbsolutePath(repoRoot),
			seenActionIds,
		)),
	];

	return records
		.filter((record) => record.sessionId === sessionId)
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function persistActionRecord(
	repoRoot: string,
	record: PersistedActionRecord,
): Promise<PersistActionRecordResult> {
	const relativePath = await writeActionRecord(repoRoot, record.actionId, {
		...record,
		updatedAt: new Date().toISOString(),
	});

	await persistSessionArtifacts(repoRoot, record.sessionId, [relativePath]);

	return {
		relativePath,
		updated: true,
	};
}
