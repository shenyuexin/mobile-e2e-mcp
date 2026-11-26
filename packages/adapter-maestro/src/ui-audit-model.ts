import type {
  AuditUiSurfaceData,
  InspectUiNode,
  Platform,
  UiAuditBaselineDiff,
  UiAuditDuplicateIdFinding,
  UiAuditEdgeClipFinding,
  UiAuditFindingNode,
  UiAuditMissingIdFinding,
  UiAuditOverlapFinding,
  UiAuditRawI18nFinding,
  UiAuditSmallTargetFinding,
  UiAuditZeroSizeFinding,
  UiBounds,
  UiSurfaceAuditIssueCounts,
} from "@mobile-e2e-mcp/contracts";
import { detectScreenBounds, parseUiBounds } from "./ui-model.js";

const INTERACTIVE_CLASS_NAMES = new Set([
  "button",
  "link",
  "switch",
  "checkbox",
  "toggle",
  "textfield",
  "securetextfield",
  "searchfield",
  "cell",
  "slider",
  "stepper",
  "segmentedcontrol",
  "tab",
  "menuitem",
  "android.widget.button",
  "android.widget.imagebutton",
  "android.widget.edittext",
  "android.widget.checkbox",
  "android.widget.switch",
  "android.widget.radiobutton",
]);

const MISSING_ID_CLASS_NAMES = new Set([
  "button",
  "link",
  "switch",
  "checkbox",
  "toggle",
  "textfield",
  "securetextfield",
  "searchfield",
  "android.widget.button",
  "android.widget.imagebutton",
  "android.widget.edittext",
  "android.widget.checkbox",
  "android.widget.switch",
  "android.widget.radiobutton",
]);

const EDGE_CLIP_EXEMPT_CLASSES = new Set([
  "cell",
  "textarea",
  "textview",
  "scrollview",
  "webview",
  "recyclerview",
  "listview",
  "androidx.recyclerview.widget.recyclerview",
]);

const RAW_I18N_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+){2,}$/;

const SF_SYMBOL_PREFIXES = [
  "pencil.",
  "photo.",
  "doc.",
  "chevron.",
  "arrow.",
  "gearshape.",
  "magnifyingglass.",
  "ellipsis.",
  "line.",
  "slider.",
  "plus.",
  "minus.",
  "xmark.",
  "checkmark.",
  "star.",
  "bookmark.",
  "sparkles.",
  "folder.",
  "trash.",
  "textformat.",
  "square.",
  "rectangle.",
  "hand.",
  "scribble.",
  "highlighter.",
  "eraser.",
];

const SYSTEM_CONTROL_LABELS = new Set([
  "shift",
  "delete",
  "more, numbers",
  "letters",
  "next keyboard",
  "return",
  "space",
  "dictation",
  "emoji",
  "dismiss keyboard",
  "hide keyboard",
  "globe",
  "sheet grabber",
  "clear text",
]);

export interface AuditUiNodesOptions {
  platform?: Platform;
  surfaceName?: string;
  screenWidth?: number;
  screenHeight?: number;
  minTouchTargetPt?: number;
  severeTouchTargetPt?: number;
  maxOverlapRatio?: number;
  minVisibleRatio?: number;
  i18nKeyPrefixes?: string[];
}

export type UiNodesAuditCoreResult = Pick<
  AuditUiSurfaceData,
  | "surfaceName"
  | "screenBounds"
  | "totalNodes"
  | "visibleInteractiveCount"
  | "issueCounts"
  | "edgeClipping"
  | "smallTargets"
  | "siblingOverlaps"
  | "missingA11yId"
  | "duplicateA11yIds"
  | "rawI18nKeys"
  | "zeroSize"
>;

function isLikelySfSymbolName(label: string, i18nKeyPrefixes: readonly string[]): boolean {
  if (i18nKeyPrefixes.some((prefix) => label.startsWith(prefix))) {
    return false;
  }
  if (
    label.includes(".and.") ||
    label.includes(".badge.") ||
    label.endsWith(".fill") ||
    label.includes(".circle") ||
    label.includes(".square") ||
    label.includes(".slash") ||
    label.includes(".dashed")
  ) {
    return true;
  }
  return SF_SYMBOL_PREFIXES.some((prefix) => label.startsWith(prefix));
}

function isSystemControlLabel(label: string | undefined): boolean {
  if (!label) {
    return false;
  }
  const trimmed = label.trim();
  if (!trimmed) {
    return false;
  }
  if (/^\S$/u.test(trimmed)) {
    return true;
  }
  return SYSTEM_CONTROL_LABELS.has(trimmed.toLowerCase());
}

function rectOverlapArea(a: UiBounds, b: UiBounds): number {
  const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlapX * overlapY;
}

function resolveNodeLabel(node: InspectUiNode): string | undefined {
  const candidate = node.contentDesc ?? node.text;
  return candidate && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

const SYSTEM_SCROLLBAR_LABEL_PATTERN = /^(vertical|horizontal)\s+scroll\s*bar\b|^(垂直|水平)滚动条|^\d+\s*(pages?|页)$/i;

function isSystemScrollBarNode(node: InspectUiNode): boolean {
  const cls = (node.className ?? "").toLowerCase();
  if (cls !== "slider" && cls !== "scrollbar") {
    return false;
  }
  const label = resolveNodeLabel(node);
  return Boolean(label && SYSTEM_SCROLLBAR_LABEL_PATTERN.test(label));
}

function isInteractiveNode(node: InspectUiNode): boolean {
  if (node.enabled === false) {
    return false;
  }
  if (isSystemScrollBarNode(node)) {
    return false;
  }
  if (node.clickable) {
    return true;
  }
  const cls = (node.className ?? "").toLowerCase();
  return INTERACTIVE_CLASS_NAMES.has(cls);
}

function buildAncestorSets(nodes: InspectUiNode[]): Array<Set<number>> {
  const result: Array<Set<number>> = [];
  const stack: Array<{ id: number; depth: number }> = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const depth = nodes[i]?.depth;
    if (typeof depth !== "number") {
      result.push(new Set());
      continue;
    }
    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= depth) {
      stack.pop();
    }
    result.push(new Set(stack.map((entry) => entry.id)));
    stack.push({ id: i, depth });
  }

  return result;
}

function toFindingNode(node: InspectUiNode, bounds: UiBounds): UiAuditFindingNode {
  const label = resolveNodeLabel(node);
  return {
    ...(node.className ? { className: node.className } : {}),
    ...(node.resourceId ? { resourceId: node.resourceId } : {}),
    ...(label ? { label } : {}),
    bounds,
  };
}

export function auditUiNodes(
  nodes: InspectUiNode[],
  options: AuditUiNodesOptions = {},
): UiNodesAuditCoreResult {
  const platform = options.platform ?? "ios";
  const minTouchTargetPt = options.minTouchTargetPt ?? (platform === "android" ? 48 : 44);
  const severeTouchTargetPt = options.severeTouchTargetPt ?? (platform === "android" ? 40 : 36);
  const maxOverlapRatio = options.maxOverlapRatio ?? 0.3;
  const minVisibleRatio = options.minVisibleRatio ?? 0.95;
  const i18nKeyPrefixes = options.i18nKeyPrefixes ?? [];
  const surfaceName = options.surfaceName ?? "current_surface";

  const detectedViewport = detectScreenBounds(nodes);
  const width = options.screenWidth && options.screenWidth > 0 ? options.screenWidth : detectedViewport.right - detectedViewport.left;
  const height = options.screenHeight && options.screenHeight > 0 ? options.screenHeight : detectedViewport.bottom - detectedViewport.top;
  const screenRect: UiBounds = {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    center: { x: Math.round(width / 2), y: Math.round(height / 2) },
  };

  const ancestorSets = buildAncestorSets(nodes);
  const edgeClipping: UiAuditEdgeClipFinding[] = [];
  const smallTargets: UiAuditSmallTargetFinding[] = [];
  const siblingOverlaps: UiAuditOverlapFinding[] = [];
  const missingA11yId: UiAuditMissingIdFinding[] = [];
  const duplicateA11yIds: UiAuditDuplicateIdFinding[] = [];
  const rawI18nKeys: UiAuditRawI18nFinding[] = [];
  const zeroSize: UiAuditZeroSizeFinding[] = [];

  for (const node of nodes) {
    const bounds = parseUiBounds(node.bounds);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      continue;
    }
    const overlap = rectOverlapArea(bounds, screenRect) / (bounds.width * bounds.height);
    if (overlap <= 0) {
      continue;
    }
    const label = resolveNodeLabel(node);
    if (label && RAW_I18N_KEY_PATTERN.test(label) && !isLikelySfSymbolName(label, i18nKeyPrefixes)) {
      rawI18nKeys.push({
        ...(node.className ? { className: node.className } : {}),
        ...(node.resourceId ? { resourceId: node.resourceId } : {}),
        label,
        bounds,
      });
    }
  }

  const visibleInteractive: Array<{ index: number; node: InspectUiNode; bounds: UiBounds; label?: string }> = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (!node || !isInteractiveNode(node)) {
      continue;
    }
    const bounds = parseUiBounds(node.bounds);
    if (!bounds) {
      continue;
    }
    const label = resolveNodeLabel(node);
    if (bounds.width <= 0 || bounds.height <= 0) {
      zeroSize.push({
        ...(node.className ? { className: node.className } : {}),
        ...(node.resourceId ? { resourceId: node.resourceId } : {}),
        ...(label ? { label } : {}),
        bounds,
      });
      continue;
    }

    const area = bounds.width * bounds.height;
    const visibleRatio = rectOverlapArea(bounds, screenRect) / area;
    if (visibleRatio <= 0) {
      continue;
    }

    visibleInteractive.push({ index: i, node, bounds, label });

    const cls = (node.className ?? "").toLowerCase();
    if (!EDGE_CLIP_EXEMPT_CLASSES.has(cls) && visibleRatio < minVisibleRatio) {
      edgeClipping.push({
        ...toFindingNode(node, bounds),
        visibleRatio: Number(visibleRatio.toFixed(2)),
      });
    }

    const systemControl = isSystemControlLabel(label);
    if (
      visibleRatio >= 0.5 &&
      (bounds.width < minTouchTargetPt || bounds.height < minTouchTargetPt) &&
      !systemControl
    ) {
      smallTargets.push({
        ...toFindingNode(node, bounds),
        severity:
          bounds.width < severeTouchTargetPt || bounds.height < severeTouchTargetPt
            ? "severe"
            : "compact",
        minRequiredPt: minTouchTargetPt,
      });
    }

    if (
      !node.resourceId &&
      (!cls || MISSING_ID_CLASS_NAMES.has(cls) || node.clickable) &&
      !systemControl
    ) {
      missingA11yId.push({
        ...(node.className ? { className: node.className } : {}),
        ...(label ? { label } : {}),
        bounds,
      });
    }
  }

  for (let i = 0; i < visibleInteractive.length; i += 1) {
    for (let j = i + 1; j < visibleInteractive.length; j += 1) {
      const a = visibleInteractive[i];
      const b = visibleInteractive[j];
      if (!a || !b) {
        continue;
      }
      if (ancestorSets[a.index]?.has(b.index) || ancestorSets[b.index]?.has(a.index)) {
        continue;
      }
      const intersection = rectOverlapArea(a.bounds, b.bounds);
      if (intersection <= 0) {
        continue;
      }
      const minArea = Math.min(a.bounds.width * a.bounds.height, b.bounds.width * b.bounds.height);
      const ratio = minArea > 0 ? intersection / minArea : 0;
      if (ratio > maxOverlapRatio) {
        siblingOverlaps.push({
          ratio: Number(ratio.toFixed(2)),
          a: toFindingNode(a.node, a.bounds),
          b: toFindingNode(b.node, b.bounds),
        });
      }
    }
  }

  const idBuckets = new Map<string, UiAuditFindingNode[]>();
  for (const item of visibleInteractive) {
    const id = item.node.resourceId;
    if (!id) {
      continue;
    }
    const bucket = idBuckets.get(id) ?? [];
    bucket.push(toFindingNode(item.node, item.bounds));
    idBuckets.set(id, bucket);
  }

  for (const [resourceId, occurrences] of idBuckets.entries()) {
    if (occurrences.length > 1) {
      duplicateA11yIds.push({
        resourceId,
        count: occurrences.length,
        occurrences,
      });
    }
  }

  const severeSmallTargets = smallTargets.filter((item) => item.severity === "severe").length;
  const issueCounts: UiSurfaceAuditIssueCounts = {
    edgeClipping: edgeClipping.length,
    siblingOverlaps: siblingOverlaps.length,
    smallTargets: smallTargets.length,
    severeSmallTargets,
    missingA11yId: missingA11yId.length,
    duplicateA11yIds: duplicateA11yIds.length,
    rawI18nKeys: rawI18nKeys.length,
    zeroSize: zeroSize.length,
    total:
      edgeClipping.length +
      siblingOverlaps.length +
      smallTargets.length +
      missingA11yId.length +
      duplicateA11yIds.length +
      rawI18nKeys.length +
      zeroSize.length,
  };

  return {
    surfaceName,
    screenBounds: { width, height },
    totalNodes: nodes.length,
    visibleInteractiveCount: visibleInteractive.length,
    issueCounts,
    edgeClipping,
    smallTargets,
    siblingOverlaps,
    missingA11yId,
    duplicateA11yIds,
    rawI18nKeys,
    zeroSize,
  };
}

export function buildUiAuditNextSuggestions(
  report: UiNodesAuditCoreResult,
  baselineDiff?: UiAuditBaselineDiff,
): string[] {
  const suggestions: string[] = [];
  if (baselineDiff?.baselineFound && baselineDiff.matchedSurface) {
    if (baselineDiff.newIssueCounts.total > 0) {
      const sampleFps = baselineDiff.newRegressions
        .slice(0, 3)
        .map((r) => r.fingerprint)
        .join(", ");
      suggestions.push(
        `[ui-baseline] Detected +${baselineDiff.newIssueCounts.total} new regression(s) on '${report.surfaceName}' vs baseline (${sampleFps}).`,
      );
    }
    if (baselineDiff.resolvedIssueCounts.total > 0) {
      suggestions.push(
        `[ui-baseline] Resolved ${baselineDiff.resolvedIssueCounts.total} baseline issue(s) on '${report.surfaceName}'; run baseline update mode to tighten the ratchet.`,
      );
    }
  }
  if (report.edgeClipping.length > 0) {
    suggestions.push(`Inspect ${report.edgeClipping.length} edge-clipped interactive element(s) for layout/safe-area clipping.`);
  }
  if (report.siblingOverlaps.length > 0) {
    suggestions.push(`Inspect ${report.siblingOverlaps.length} overlapping sibling interactive pair(s) that may block taps.`);
  }
  if (report.issueCounts.severeSmallTargets > 0) {
    suggestions.push(`Enlarge ${report.issueCounts.severeSmallTargets} severe undersized touch target(s) to meet platform minimum hit targets.`);
  }
  if (report.duplicateA11yIds.length > 0) {
    suggestions.push(`Disambiguate ${report.duplicateA11yIds.length} duplicate accessibility/resource ID(s) to avoid AMBIGUOUS_MATCH.`);
  }
  if (report.rawI18nKeys.length > 0) {
    suggestions.push(`Resolve ${report.rawI18nKeys.length} raw i18n localization key(s) visible on '${report.surfaceName}'.`);
  }
  if (report.missingA11yId.length > 0) {
    suggestions.push(`Add stable accessibilityIdentifier / resourceId to ${report.missingA11yId.length} interactive control(s).`);
  }
  return suggestions;
}
