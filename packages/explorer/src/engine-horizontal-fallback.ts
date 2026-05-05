/**
 * Horizontal scroll fallback orchestration for the DFS engine.
 *
 * When vertical segments are exhausted on a frame, this module attempts
 * a one-time bounded probe to discover horizontally scrollable content.
 * If the probe succeeds, the frame's scrollState is switched to horizontal.
 */

import { resolveExplorerPlatformHooks } from "./explorer-platform.js";
import { normalizeScrollState } from "./types.js";
import {
  detectHorizontalScrollables,
  performBoundedProbe,
  startHorizontalScrollState,
} from "./scroll-segment.js";
import type { ExplorerConfig, Frame, McpToolInterface, PageSnapshot, UiHierarchy } from "./types.js";

// Track which frames have had horizontal probe attempted (once per frame)
const horizontalProbeAttempted = new WeakSet<Frame>();

/**
 * Check whether a horizontal probe has already been attempted for this frame.
 */
export function hasHorizontalProbeBeenAttempted(frame: Frame): boolean {
  return horizontalProbeAttempted.has(frame);
}

/**
 * Mark that a horizontal probe has been attempted for this frame.
 */
export function markHorizontalProbeAttempted(frame: Frame): void {
  horizontalProbeAttempted.add(frame);
}

/**
 * Attempt to discover and switch to horizontal scroll exploration.
 *
 * Called by the engine when vertical segments are exhausted.
 * Performs a bounded probe swipe and, if successful, transitions the frame
 * to horizontal exploration via `startHorizontalScrollState`.
 *
 * @returns `true` if the frame was switched to horizontal exploration
 */
export async function attemptHorizontalDiscovery(
  mcp: McpToolInterface,
  frame: Frame,
  config: ExplorerConfig,
): Promise<boolean> {
  if (!frame.scrollState?.enabled) {
    return false;
  }

  const normalized = normalizeScrollState(frame.scrollState);
  if (normalized.axis !== "vertical") {
    return false;
  }

  // Need current uiTree to detect horizontal candidates
  const inspectResult = await mcp.inspectUi({ appId: config.appId });
  if (inspectResult.status !== "success" && inspectResult.status !== "partial") {
    return false;
  }

  const platformHooks = resolveExplorerPlatformHooks(config.platform);
  const inspectData = inspectResult.data as unknown as Record<string, unknown>;
  const uiTree = platformHooks.parseInspectUi(inspectData, { fallbackToDataRoot: true }) as UiHierarchy;

  const candidates = detectHorizontalScrollables(uiTree);
  if (candidates.length === 0) {
    return false;
  }

  console.log(`[SCROLL-AXIS] Vertical exhausted. Attempting horizontal discovery...`);
  const probeResult = await performBoundedProbe(mcp, frame, config, candidates);
  if (!probeResult.enabled) {
    console.log(`[SCROLL-AXIS] Horizontal probe disabled: ${probeResult.disabledReason ?? "unknown"}`);
    return false;
  }

  // Build a minimal snapshot for startHorizontalScrollState
  const appId = platformHooks.extractAppId(uiTree) ?? config.appId;
  const pageContext =
    typeof inspectData.pageContext === "object" && inspectData.pageContext !== null
      ? inspectData.pageContext
      : undefined;
  const currentSnapshot: PageSnapshot = {
    screenId: frame.state.screenId ?? "",
    screenTitle: platformHooks.extractScreenTitle(uiTree) ?? frame.state.screenTitle,
    pageContext: pageContext as PageSnapshot["pageContext"],
    uiTree,
    clickableElements: [],
    screenshotPath: "",
    capturedAt: new Date().toISOString(),
    arrivedFrom: null,
    viaElement: null,
    depth: frame.depth,
    loadTimeMs: 0,
    stabilityScore: 1.0,
    appId,
    isExternalApp: false,
  };

  startHorizontalScrollState(frame, currentSnapshot, config, probeResult);
  console.log(`[SCROLL-AXIS] Switched to horizontal exploration`);
  return true;
}
