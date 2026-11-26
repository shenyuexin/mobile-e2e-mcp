import type { UiHierarchy } from "./types.js";

export interface UiFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IosPresentationScope {
  /** Whether an active foreground popover, sheet, or modal alert overlay was detected. */
  isModalOverlay: boolean;
  /** Kind of detected overlay. */
  kind: "popover" | "sheet" | "alert" | "none";
  /** Foreground subtree root to scope element discovery and title extraction to. */
  activeRoot: UiHierarchy;
  /** Bounding rect of the foreground modal/popover content container when known. */
  overlayFrame?: UiFrameRect;
  /** Root application/screen frame when known. */
  screenFrame?: UiFrameRect;
  /** True when UIKit/SwiftUI PopoverDismissRegion backdrop is present (tap outside dismisses). */
  hasDismissBackdrop: boolean;
}

const LEAF_NON_CONTAINER_TYPES = new Set([
  "button",
  "statictext",
  "image",
  "cell",
  "textfield",
  "securetextfield",
  "textview",
  "searchfield",
  "switch",
  "checkbox",
  "toggle",
  "slider",
  "link",
  "heading",
]);

function normalizeType(node: UiHierarchy): string {
  return (node.className ?? node.elementType ?? "").trim().toLowerCase();
}

function normalizeRole(node: UiHierarchy): string {
  return (node.accessibilityRole ?? "").trim().toLowerCase();
}

function normalizeIdentifier(node: UiHierarchy): string {
  return (node.AXUniqueId ?? node.resourceId ?? "").trim().toLowerCase();
}

function normalizeLabel(node: UiHierarchy): string {
  return (node.accessibilityLabel ?? node.contentDesc ?? node.text ?? node.label ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function isAndroidTree(node: UiHierarchy): boolean {
  const stack: UiHierarchy[] = [node];
  let inspected = 0;
  while (stack.length > 0 && inspected < 40) {
    const current = stack.pop()!;
    inspected += 1;
    const typeName = current.className ?? current.elementType ?? "";
    if (typeName.startsWith("android.") || typeName.startsWith("androidx.")) {
      return true;
    }
    if (current.children) {
      for (const child of current.children) {
        stack.push(child);
      }
    }
  }
  return false;
}

/**
 * Detect UIKit/SwiftUI's invisible full-screen popover/sheet dismissal backdrop.
 */
export function isPopoverDismissRegion(node: UiHierarchy): boolean {
  const id = normalizeIdentifier(node);
  const label = normalizeLabel(node).toLowerCase();
  return (
    id === "popoverdismissregion" ||
    id.includes("popoverdismissregion") ||
    label === "dismiss popup"
  );
}

function hasUsableFrame(frame: UiFrameRect | undefined): frame is UiFrameRect {
  return Boolean(frame && Number.isFinite(frame.width) && Number.isFinite(frame.height) && frame.width > 0 && frame.height > 0);
}

function resolveScreenFrame(uiTree: UiHierarchy): UiFrameRect | undefined {
  const queue: UiHierarchy[] = [uiTree];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const typeLower = normalizeType(node);
    if (typeLower === "application" && hasUsableFrame(node.frame)) {
      return node.frame;
    }
    if (node.children) {
      for (const child of node.children) {
        queue.push(child);
      }
    }
  }
  if (hasUsableFrame(uiTree.frame)) {
    return uiTree.frame;
  }
  return undefined;
}

function hasInteractiveOrTextContent(node: UiHierarchy): boolean {
  const stack: UiHierarchy[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (isPopoverDismissRegion(current)) {
      continue;
    }
    const typeLower = normalizeType(current);
    const roleLower = normalizeRole(current);
    if (
      typeLower === "button" ||
      typeLower === "statictext" ||
      typeLower === "heading" ||
      typeLower === "textfield" ||
      typeLower === "securetextfield" ||
      typeLower === "cell" ||
      typeLower === "switch" ||
      typeLower === "checkbox" ||
      typeLower === "link" ||
      roleLower.includes("button") ||
      roleLower.includes("statictext") ||
      roleLower.includes("heading")
    ) {
      return true;
    }
    if (current.clickable && typeLower !== "group" && typeLower !== "image") {
      return true;
    }
    if (current.children) {
      for (const child of current.children) {
        stack.push(child);
      }
    }
  }
  return false;
}

function isSmallerThanScreen(frame: UiFrameRect | undefined, screenFrame: UiFrameRect | undefined): boolean {
  if (!hasUsableFrame(frame) || !hasUsableFrame(screenFrame)) {
    return false;
  }
  const area = frame.width * frame.height;
  const screenArea = screenFrame.width * screenFrame.height;
  return area > 0 && area < screenArea * 0.92;
}

function isExplicitModalOverlayContainer(node: UiHierarchy): "popover" | "sheet" | "alert" | null {
  if (!node.children || node.children.length === 0) {
    return null;
  }
  const typeLower = normalizeType(node);
  if (LEAF_NON_CONTAINER_TYPES.has(typeLower)) {
    return null;
  }
  const roleLower = normalizeRole(node);
  const idLower = normalizeIdentifier(node);

  if (typeLower.includes("popover") || roleLower.includes("popover")) {
    return "popover";
  }
  if (typeLower.includes("sheet") || roleLower.includes("sheet")) {
    return "sheet";
  }
  if (
    (typeLower === "alert" || roleLower === "axalert" || roleLower === "alert") &&
    !typeLower.includes("button")
  ) {
    return "alert";
  }
  if (/(^|[._-])popover($|[._-])/.test(idLower)) {
    return "popover";
  }
  if (/(^|[._-])(sheet|modal)($|[._-])/.test(idLower)) {
    return "sheet";
  }
  return null;
}

function wrapActiveSiblings(siblings: UiHierarchy[], fallbackFrame?: UiFrameRect): UiHierarchy {
  if (siblings.length === 1) {
    return siblings[0];
  }
  return {
    className: "Group",
    elementType: "Group",
    clickable: false,
    enabled: true,
    scrollable: false,
    frame: fallbackFrame,
    children: siblings,
  };
}

/**
 * Inspect an iOS accessibility hierarchy to determine whether a foreground
 * Popover, Sheet, or Alert overlay is active over an underlying view (such as
 * an iPad SplitView sidebar + detail pane).
 *
 * UIKit/SwiftUI on iPadOS can emit multiple `PopoverDismissRegion` nodes (one
 * wrapping the dimmed background SplitView and another wrapping the frontmost
 * presented popover/sheet). We pick the modal-sized / frontmost (last in DFS
 * order) presentation layer so traversal stays scoped to the active overlay.
 */
export function inspectIosPresentationScope(uiTree: UiHierarchy): IosPresentationScope {
  if (isAndroidTree(uiTree)) {
    return {
      isModalOverlay: false,
      kind: "none",
      activeRoot: uiTree,
      hasDismissBackdrop: false,
    };
  }

  const screenFrame = resolveScreenFrame(uiTree);

  // Strategy 1: UIKit/SwiftUI presentation container containing a PopoverDismissRegion sibling.
  interface DismissCandidate {
    siblings: UiHierarchy[];
    primaryFrame?: UiFrameRect;
    isModalSized: boolean;
    order: number;
  }

  const dismissCandidates: DismissCandidate[] = [];
  let visitOrder = 0;

  const walkForDismissRegions = (node: UiHierarchy): void => {
    const children = node.children ?? [];
    if (children.length >= 2) {
      const hasDismissChild = children.some((child) => isPopoverDismissRegion(child));
      if (hasDismissChild) {
        const contentSiblings = children.filter(
          (child) => !isPopoverDismissRegion(child) && hasInteractiveOrTextContent(child),
        );
        if (contentSiblings.length > 0) {
          const primaryFrame = contentSiblings.find((sibling) => hasUsableFrame(sibling.frame))?.frame;
          dismissCandidates.push({
            siblings: contentSiblings,
            primaryFrame,
            isModalSized: isSmallerThanScreen(primaryFrame, screenFrame),
            order: visitOrder++,
          });
        }
      }
    }
    for (const child of children) {
      walkForDismissRegions(child);
    }
  };
  walkForDismissRegions(uiTree);

  if (dismissCandidates.length > 0) {
    // Prefer modal-sized presentation containers over full-screen dimmed background wrappers;
    // among ties, UIKit lists frontmost presentation layers last in tree order.
    const modalSized = dismissCandidates.filter((candidate) => candidate.isModalSized);
    const chosenPool = modalSized.length > 0 ? modalSized : dismissCandidates;
    const chosen = chosenPool[chosenPool.length - 1];
    const activeRoot = wrapActiveSiblings(chosen.siblings, chosen.primaryFrame);
    const kind: "popover" | "sheet" =
      chosen.primaryFrame &&
      screenFrame &&
      chosen.primaryFrame.width >= screenFrame.width * 0.48 &&
      chosen.primaryFrame.height >= screenFrame.height * 0.42
        ? "sheet"
        : "popover";

    return {
      isModalOverlay: true,
      kind,
      activeRoot,
      overlayFrame: chosen.primaryFrame,
      screenFrame,
      hasDismissBackdrop: true,
    };
  }

  // Strategy 2: Explicit Popover/Sheet/Alert overlay container without PopoverDismissRegion
  // (e.g., custom SwiftUI overlay with `.popover` / `.sheet` container identifier or AXPopover/AXSheet).
  interface ExplicitCandidate {
    node: UiHierarchy;
    kind: "popover" | "sheet" | "alert";
  }

  const explicitCandidates: ExplicitCandidate[] = [];
  const walkForExplicitOverlays = (node: UiHierarchy): void => {
    const kind = isExplicitModalOverlayContainer(node);
    if (kind && hasInteractiveOrTextContent(node)) {
      explicitCandidates.push({ node, kind });
    }
    for (const child of node.children ?? []) {
      walkForExplicitOverlays(child);
    }
  };
  walkForExplicitOverlays(uiTree);

  if (explicitCandidates.length > 0) {
    const chosen = explicitCandidates[explicitCandidates.length - 1];
    return {
      isModalOverlay: true,
      kind: chosen.kind,
      activeRoot: chosen.node,
      overlayFrame: hasUsableFrame(chosen.node.frame) ? chosen.node.frame : undefined,
      screenFrame,
      hasDismissBackdrop: false,
    };
  }

  return {
    isModalOverlay: false,
    kind: "none",
    activeRoot: uiTree,
    screenFrame,
    hasDismissBackdrop: false,
  };
}

/**
 * Extract explicit dismiss/close/cancel button labels from an active foreground
 * modal overlay (e.g., "Close", "Dismiss", "Cancel", "Close page settings").
 */
export function extractOverlayDismissButtonLabels(activeRoot: UiHierarchy): string[] {
  const exactPriority: string[] = [];
  const prefixed: string[] = [];
  const seen = new Set<string>();

  const pushLabel = (target: string[], raw: string): void => {
    const cleaned = raw.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      return;
    }
    seen.add(key);
    target.push(cleaned);
  };

  const stack: UiHierarchy[] = [activeRoot];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isPopoverDismissRegion(node)) {
      continue;
    }
    const typeLower = normalizeType(node);
    const roleLower = normalizeRole(node);
    const isButtonLike =
      node.clickable || typeLower.includes("button") || roleLower.includes("button");

    if (isButtonLike) {
      const label = normalizeLabel(node);
      const lower = label.toLowerCase();
      if (["close", "dismiss", "cancel", "done"].includes(lower)) {
        pushLabel(exactPriority, label);
      } else if (
        lower.startsWith("close ") ||
        lower.startsWith("dismiss ") ||
        lower.startsWith("cancel ")
      ) {
        pushLabel(prefixed, label);
      }
    }

    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }
  }

  return [...exactPriority, ...prefixed];
}

function isPointOutsideRect(x: number, y: number, rect: UiFrameRect, pad = 16): boolean {
  return (
    x < rect.x - pad ||
    x > rect.x + rect.width + pad ||
    y < rect.y - pad ||
    y > rect.y + rect.height + pad
  );
}

/**
 * Compute safe screen tap coordinates strictly outside a foreground popover/sheet
 * frame so UIKit's PopoverDismissRegion dismisses the overlay without hitting
 * status bar chrome or the home indicator.
 */
export function computeOutsidePopoverTapPoints(
  overlayFrame: UiFrameRect | undefined,
  screenFrame: UiFrameRect | undefined,
): Array<{ x: number; y: number; name: string }> {
  if (!hasUsableFrame(overlayFrame) || !hasUsableFrame(screenFrame)) {
    return [];
  }

  const minX = Math.round(screenFrame.x + 24);
  const maxX = Math.round(screenFrame.x + screenFrame.width - 24);
  const minY = Math.round(screenFrame.y + 80);
  const maxY = Math.round(screenFrame.y + screenFrame.height - 80);
  if (minX >= maxX || minY >= maxY) {
    return [];
  }

  const clampX = (val: number): number => Math.max(minX, Math.min(maxX, Math.round(val)));
  const clampY = (val: number): number => Math.max(minY, Math.min(maxY, Math.round(val)));

  const midX = clampX(overlayFrame.x + overlayFrame.width / 2);
  const midY = clampY(overlayFrame.y + overlayFrame.height / 2);
  const offset = 48;

  const rawCandidates = [
    { x: clampX(overlayFrame.x + overlayFrame.width + offset), y: midY, name: "outside-right" },
    { x: clampX(overlayFrame.x - offset), y: midY, name: "outside-left" },
    { x: midX, y: clampY(overlayFrame.y + overlayFrame.height + offset), name: "outside-below" },
    { x: midX, y: clampY(overlayFrame.y - offset), name: "outside-above" },
    { x: maxX, y: maxY, name: "outside-bottom-right" },
    { x: maxX, y: minY, name: "outside-top-right" },
  ];

  const seen = new Set<string>();
  const valid: Array<{ x: number; y: number; name: string }> = [];
  for (const pt of rawCandidates) {
    if (!isPointOutsideRect(pt.x, pt.y, overlayFrame, 16)) {
      continue;
    }
    const key = `${pt.x},${pt.y}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    valid.push(pt);
  }
  return valid;
}
