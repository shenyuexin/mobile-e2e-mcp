import type {
  UiAuditBaselineCategory,
  UiAuditBaselineCategoryCounts,
  UiAuditBaselineDiff,
  UiAuditBaselineFile,
  UiAuditBaselineMode,
  UiAuditBaselineRegressionItem,
  UiAuditBaselineSurfaceEntry,
  UiBounds,
} from "@mobile-e2e-mcp/contracts";
import type { UiNodesAuditCoreResult } from "./ui-audit-model.js";

export const UI_AUDIT_BASELINE_CATEGORIES: readonly UiAuditBaselineCategory[] = [
  "edgeClipping",
  "siblingOverlaps",
  "severeSmallTargets",
  "missingA11yId",
  "duplicateA11yIds",
  "rawI18nKeys",
  "zeroSize",
];

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_OR_SQL_TIMESTAMP_PATTERN = /\b\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const DATE_PATTERN = /\b\d{4}[-/]\d{2}[-/]\d{2}\b/g;
const TIME_PATTERN = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?\b/gi;

export function normalizeDynamicTokens(value: string): string {
  return value
    .replace(UUID_PATTERN, "<uuid>")
    .replace(ISO_OR_SQL_TIMESTAMP_PATTERN, "<timestamp>")
    .replace(DATE_PATTERN, "<date>")
    .replace(TIME_PATTERN, "<time>");
}

export function buildAuditNodeSignature(node: {
  className?: string;
  resourceId?: string;
  label?: string;
  bounds?: UiBounds;
}): string {
  const cls = (node.className ?? "").toLowerCase();
  if (node.resourceId) {
    return `${cls}#${normalizeDynamicTokens(node.resourceId)}`;
  }
  if (node.label) {
    const normalizedLabel = normalizeDynamicTokens(node.label.trim());
    const stableLabel = /^\d+$/.test(normalizedLabel) ? "<num>" : normalizedLabel;
    return `${cls}@${stableLabel}`;
  }
  if (node.bounds) {
    const bucketLeft = Math.round(node.bounds.left / 32);
    const bucketTop = Math.round(node.bounds.top / 32);
    const bucketW = Math.round(node.bounds.width / 16);
    const bucketH = Math.round(node.bounds.height / 16);
    return `${cls}~${bucketLeft}:${bucketTop}:${bucketW}x${bucketH}`;
  }
  return `${cls}~unknown`;
}

function createEmptyCategoryCounts(): UiAuditBaselineCategoryCounts {
  return {
    edgeClipping: 0,
    siblingOverlaps: 0,
    severeSmallTargets: 0,
    missingA11yId: 0,
    duplicateA11yIds: 0,
    rawI18nKeys: 0,
    zeroSize: 0,
    total: 0,
  };
}

function createEmptyFingerprintRecord(): Record<UiAuditBaselineCategory, Record<string, number>> {
  return {
    edgeClipping: {},
    siblingOverlaps: {},
    severeSmallTargets: {},
    missingA11yId: {},
    duplicateA11yIds: {},
    rawI18nKeys: {},
    zeroSize: {},
  };
}

function sortFingerprintMap(input: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(input).sort()) {
    const count = input[key];
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      sorted[key] = count;
    }
  }
  return sorted;
}

function incrementFingerprint(bucket: Record<string, number>, fp: string): void {
  bucket[fp] = (bucket[fp] ?? 0) + 1;
}

/** Extracts a deterministic, UUID-normalized multiset baseline entry from a surface audit result. */
export function buildUiAuditBaselineSurface(audit: UiNodesAuditCoreResult): UiAuditBaselineSurfaceEntry {
  const fingerprints = createEmptyFingerprintRecord();

  for (const finding of audit.edgeClipping) {
    incrementFingerprint(fingerprints.edgeClipping, `edgeClipping|${buildAuditNodeSignature(finding)}`);
  }
  for (const finding of audit.siblingOverlaps) {
    const [leftSig, rightSig] = [
      buildAuditNodeSignature(finding.a),
      buildAuditNodeSignature(finding.b),
    ].sort();
    incrementFingerprint(fingerprints.siblingOverlaps, `siblingOverlaps|${leftSig}<>${rightSig}`);
  }
  for (const finding of audit.smallTargets) {
    if (finding.severity === "severe") {
      incrementFingerprint(fingerprints.severeSmallTargets, `severeSmallTargets|${buildAuditNodeSignature(finding)}`);
    }
  }
  for (const finding of audit.missingA11yId) {
    incrementFingerprint(fingerprints.missingA11yId, `missingA11yId|${buildAuditNodeSignature(finding)}`);
  }
  for (const finding of audit.duplicateA11yIds) {
    incrementFingerprint(fingerprints.duplicateA11yIds, `duplicateA11yIds|${normalizeDynamicTokens(finding.resourceId)}`);
  }
  for (const finding of audit.rawI18nKeys) {
    const cls = (finding.className ?? "").toLowerCase();
    const id = normalizeDynamicTokens(finding.resourceId ?? "");
    const lbl = normalizeDynamicTokens(finding.label);
    incrementFingerprint(fingerprints.rawI18nKeys, `rawI18nKeys|${cls}|${id}|${lbl}`);
  }
  for (const finding of audit.zeroSize) {
    incrementFingerprint(fingerprints.zeroSize, `zeroSize|${buildAuditNodeSignature(finding)}`);
  }

  for (const cat of UI_AUDIT_BASELINE_CATEGORIES) {
    fingerprints[cat] = sortFingerprintMap(fingerprints[cat]);
  }

  return {
    counts: {
      edgeClipping: audit.edgeClipping.length,
      siblingOverlaps: audit.siblingOverlaps.length,
      severeSmallTargets: audit.smallTargets.filter((item) => item.severity === "severe").length,
      missingA11yId: audit.missingA11yId.length,
      duplicateA11yIds: audit.duplicateA11yIds.length,
      rawI18nKeys: audit.rawI18nKeys.length,
      zeroSize: audit.zeroSize.length,
    },
    fingerprints,
  };
}

/** Diffs a current surface audit against a parsed baseline file using deterministic multiset counts. */
export function diffUiAuditAgainstBaseline(
  audit: UiNodesAuditCoreResult,
  baselineFile: UiAuditBaselineFile | null,
  options: {
    baselinePath: string;
    mode: UiAuditBaselineMode;
    baselineUpdated?: boolean;
  },
): UiAuditBaselineDiff {
  const baselineFound = baselineFile !== null;
  const baselineSurface = baselineFile?.surfaces?.[audit.surfaceName];
  const matchedSurface = Boolean(baselineSurface);
  const currentEntry = buildUiAuditBaselineSurface(audit);

  const newIssueCounts = createEmptyCategoryCounts();
  const preExistingIssueCounts = createEmptyCategoryCounts();
  const resolvedIssueCounts = createEmptyCategoryCounts();
  const newRegressions: UiAuditBaselineRegressionItem[] = [];
  const resolvedItems: UiAuditBaselineRegressionItem[] = [];

  for (const cat of UI_AUDIT_BASELINE_CATEGORIES) {
    const currentMap = currentEntry.fingerprints[cat] ?? {};
    const baselineMap = baselineSurface?.fingerprints?.[cat] ?? {};
    const allKeys = new Set([...Object.keys(currentMap), ...Object.keys(baselineMap)]);

    let categoryNew = 0;
    let categoryPre = 0;
    let categoryResolved = 0;

    for (const fp of allKeys) {
      const currentCount = currentMap[fp] ?? 0;
      const baselineCount = baselineMap[fp] ?? 0;
      categoryPre += Math.min(currentCount, baselineCount);
      if (currentCount > baselineCount) {
        const delta = currentCount - baselineCount;
        categoryNew += delta;
        newRegressions.push({
          category: cat,
          fingerprint: fp,
          delta,
          baselineCount,
          currentCount,
        });
      } else if (baselineCount > currentCount) {
        const delta = baselineCount - currentCount;
        categoryResolved += delta;
        resolvedItems.push({
          category: cat,
          fingerprint: fp,
          delta,
          baselineCount,
          currentCount,
        });
      }
    }

    newIssueCounts[cat] = categoryNew;
    preExistingIssueCounts[cat] = categoryPre;
    resolvedIssueCounts[cat] = categoryResolved;
    newIssueCounts.total += categoryNew;
    preExistingIssueCounts.total += categoryPre;
    resolvedIssueCounts.total += categoryResolved;
  }

  newRegressions.sort((a, b) => a.category.localeCompare(b.category) || a.fingerprint.localeCompare(b.fingerprint));
  resolvedItems.sort((a, b) => a.category.localeCompare(b.category) || a.fingerprint.localeCompare(b.fingerprint));

  return {
    baselinePath: options.baselinePath,
    mode: options.mode,
    baselineFound,
    matchedSurface,
    baselineUpdated: Boolean(options.baselineUpdated),
    newIssueCounts,
    preExistingIssueCounts,
    resolvedIssueCounts,
    newRegressions,
    resolvedItems,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses and validates a serialized UI audit baseline JSON file. Returns `null` if malformed. */
export function parseUiAuditBaselineFile(raw: string): UiAuditBaselineFile | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.schemaVersion !== 1 || !isPlainObject(parsed.surfaces)) {
      return null;
    }
    const surfaces: Record<string, UiAuditBaselineSurfaceEntry> = {};
    for (const [surfaceName, rawEntry] of Object.entries(parsed.surfaces)) {
      if (!isPlainObject(rawEntry) || !isPlainObject(rawEntry.fingerprints)) {
        return null;
      }
      const fingerprints = createEmptyFingerprintRecord();
      for (const cat of UI_AUDIT_BASELINE_CATEGORIES) {
        const rawBucket = rawEntry.fingerprints[cat];
        if (rawBucket === undefined) continue;
        if (!isPlainObject(rawBucket)) return null;
        const normalizedBucket: Record<string, number> = {};
        for (const [fp, count] of Object.entries(rawBucket)) {
          if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
          if (count > 0) normalizedBucket[fp] = Math.floor(count);
        }
        fingerprints[cat] = sortFingerprintMap(normalizedBucket);
      }
      surfaces[surfaceName] = {
        counts: {
          edgeClipping: Object.values(fingerprints.edgeClipping).reduce((sum, n) => sum + n, 0),
          siblingOverlaps: Object.values(fingerprints.siblingOverlaps).reduce((sum, n) => sum + n, 0),
          severeSmallTargets: Object.values(fingerprints.severeSmallTargets).reduce((sum, n) => sum + n, 0),
          missingA11yId: Object.values(fingerprints.missingA11yId).reduce((sum, n) => sum + n, 0),
          duplicateA11yIds: Object.values(fingerprints.duplicateA11yIds).reduce((sum, n) => sum + n, 0),
          rawI18nKeys: Object.values(fingerprints.rawI18nKeys).reduce((sum, n) => sum + n, 0),
          zeroSize: Object.values(fingerprints.zeroSize).reduce((sum, n) => sum + n, 0),
        },
        fingerprints,
      };
    }
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      surfaces,
    };
  } catch {
    return null;
  }
}

/** Merges a single surface entry into an existing baseline file with deterministic surface & key sorting. */
export function mergeUiAuditBaselineFile(
  existing: UiAuditBaselineFile | null,
  surfaceName: string,
  entry: UiAuditBaselineSurfaceEntry,
  updatedAt = new Date().toISOString(),
): UiAuditBaselineFile {
  const combined: Record<string, UiAuditBaselineSurfaceEntry> = {
    ...(existing?.surfaces ?? {}),
    [surfaceName]: entry,
  };
  const sortedSurfaces: Record<string, UiAuditBaselineSurfaceEntry> = {};
  for (const key of Object.keys(combined).sort()) {
    const surfaceEntry = combined[key];
    if (surfaceEntry) {
      sortedSurfaces[key] = surfaceEntry;
    }
  }
  return {
    schemaVersion: 1,
    updatedAt,
    surfaces: sortedSurfaces,
  };
}
