import { parseUiTreeFromInspectData } from "./ui-tree-parser.js";
import type { UiHierarchy } from "./types.js";
import type {
  ExplorerNavigateBackInput,
  ExplorerNavigateBackSelector,
  ExplorerPlatformHooks,
} from "./explorer-platform.js";
import { inspectIosPresentationScope, isPopoverDismissRegion } from "./ios-presentation-scope.js";

function flattenTree(node: UiHierarchy, result: UiHierarchy[] = []): UiHierarchy[] {
  if (isPopoverDismissRegion(node)) {
    return result;
  }
  result.push(node);
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, result);
    }
  }
  return result;
}

function getNodeTitleLabel(el: UiHierarchy): string | undefined {
  const raw = el.accessibilityLabel || el.contentDesc || el.text || el.label;
  const cleaned = raw?.trim().replace(/\s+/g, " ");
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
}

function isDetailPaneElement(
  el: UiHierarchy,
  screenFrame?: { x: number; y: number; width: number; height: number },
): boolean {
  if (!screenFrame || screenFrame.width < 700 || !el.frame) {
    return false;
  }
  return el.frame.x >= screenFrame.x + screenFrame.width * 0.32;
}

function extractScreenTitle(uiTree: UiHierarchy): string | undefined {
  const scope = inspectIosPresentationScope(uiTree);
  const allElements = flattenTree(scope.activeRoot);
  const splitViewAware = !scope.isModalOverlay && Boolean(scope.screenFrame && scope.screenFrame.width >= 700);

  // 1. Explicit Heading elements (prefer detail pane on iPad SplitView when multiple headings exist)
  const headingCandidates: Array<{ el: UiHierarchy; label: string }> = [];
  for (const el of allElements) {
    if (el.className === "Heading" || el.elementType === "Heading") {
      const label = getNodeTitleLabel(el);
      if (label) {
        headingCandidates.push({ el, label });
      }
    }
  }
  if (headingCandidates.length > 0) {
    if (splitViewAware) {
      const detailHeading = headingCandidates.find((c) => isDetailPaneElement(c.el, scope.screenFrame));
      if (detailHeading) {
        return detailHeading.label;
      }
    }
    return headingCandidates[0].label;
  }

  // 2. NavigationBar title (prefer detail pane on iPad SplitView)
  const navBarCandidates: Array<{ el: UiHierarchy; label: string }> = [];
  for (const el of allElements) {
    const typeLower = (el.className ?? el.elementType ?? "").toLowerCase();
    const roleLower = (el.accessibilityRole ?? "").toLowerCase();
    if (typeLower.includes("navigationbar") || roleLower.includes("nav bar")) {
      const directLabel = getNodeTitleLabel(el);
      if (directLabel && directLabel.length < 60) {
        navBarCandidates.push({ el, label: directLabel });
      } else if (el.children) {
        for (const child of flattenTree(el)) {
          if (child === el) continue;
          if (
            child.className === "Heading" ||
            child.elementType === "Heading" ||
            child.className === "StaticText" ||
            child.elementType === "StaticText"
          ) {
            const childLabel = getNodeTitleLabel(child);
            if (childLabel && childLabel.length > 1 && childLabel.length < 60) {
              navBarCandidates.push({ el: child, label: childLabel });
              break;
            }
          }
        }
      }
    }
  }
  if (navBarCandidates.length > 0) {
    if (splitViewAware) {
      const detailNav = navBarCandidates.find((c) => isDetailPaneElement(c.el, scope.screenFrame));
      if (detailNav) {
        return detailNav.label;
      }
    }
    return navBarCandidates[0].label;
  }

  // 3. Explicit title-tagged StaticText (e.g. commandBar.documentTitle, library.createManage.title)
  for (const el of allElements) {
    if (el.className === "StaticText" || el.elementType === "StaticText") {
      const id = (el.AXUniqueId ?? el.resourceId ?? "").trim();
      if (id && /(^|[._-])(document|screen|sheet|popover)?title$/i.test(id)) {
        const label = getNodeTitleLabel(el);
        if (label && label.length > 0 && label.length < 60) {
          return label;
        }
      }
    }
  }

  // 4. First short StaticText in active presentation scope
  for (const el of allElements) {
    if (el.className === "StaticText" || el.elementType === "StaticText") {
      const label = el.contentDesc || el.text || el.accessibilityLabel;
      if (label && label.length > 2 && label.length < 50) {
        return label.trim().split(/\s+/).slice(0, 3).join(" ");
      }
    }
  }

  return undefined;
}

function extractAppId(uiTree: UiHierarchy): string | undefined {
  const allElements = flattenTree(uiTree);

  for (const el of allElements) {
    if (el.className === "Application" || el.elementType === "Application") {
      const raw = el as Record<string, unknown>;
      const packageName = el.packageName
        || (typeof raw.bundleIdentifier === "string" ? raw.bundleIdentifier : undefined)
        || (typeof raw.bundleId === "string" ? raw.bundleId : undefined)
        || (typeof raw.bundle === "string" ? raw.bundle : undefined);
      const pid = raw.pid;

      return packageName
        || el.accessibilityLabel
        || (typeof pid === "string" || typeof pid === "number" ? `pid:${pid}` : undefined);
    }
  }

  return undefined;
}

function buildNavigateBackSelector(args?: ExplorerNavigateBackInput): ExplorerNavigateBackSelector | undefined {
  if (args?.iosStrategy === "edge_swipe") {
    return undefined;
  }
  if (args?.selector) {
    return { ...args.selector };
  }
  if (!args?.parentPageTitle) {
    return undefined;
  }
  return { text: args.parentPageTitle, contentDesc: args.parentPageTitle };
}

export function createExplorerPlatformIosHooks(): ExplorerPlatformHooks {
  return {
    platform: "ios",
    parseInspectUi: (data, options) => parseUiTreeFromInspectData(data, options),
    extractScreenTitle,
    extractAppId,
    buildNavigateBackSelector,
  };
}
