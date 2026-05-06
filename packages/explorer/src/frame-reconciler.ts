import { hashUiStructure } from "./page-registry.js";
import type { Frame, PageSnapshot } from "./types.js";

function normalizeNavText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeTitleForMatch(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function isLikelyBundleId(value: string): boolean {
  return value.includes(".") && !value.includes(" ");
}

function shouldPreserveScrollStateOnReconcile(
  frame: Frame,
  snapshot: PageSnapshot,
  targetAppId: string,
): boolean {
  if (!frame.scrollState) {
    return false;
  }

  const frameTitle = normalizeTitleForMatch(frame.state.screenTitle);
  const snapshotTitle = normalizeTitleForMatch(snapshot.screenTitle);
  if (!frameTitle || !snapshotTitle || frameTitle !== snapshotTitle) {
    return false;
  }

  const frameAppId = frame.appId ?? targetAppId;
  const snapshotAppId = snapshot.appId ?? frameAppId;
  if (frameAppId !== snapshotAppId) {
    return false;
  }

  const framePageContextType = frame.state.pageContextType;
  const snapshotPageContextType = snapshot.pageContext?.type;
  if (
    framePageContextType !== undefined &&
    snapshotPageContextType !== undefined &&
    framePageContextType !== snapshotPageContextType
  ) {
    return false;
  }

  return true;
}

export function findAncestorFrameIndex(
  stack: Frame[],
  snapshot: Pick<PageSnapshot, "screenId" | "screenTitle" | "appId">,
): number {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const sameScreen = stack[index].state.screenId === snapshot.screenId;
    const sameAppIdentity =
      snapshot.appId === undefined ||
      stack[index].appId === undefined ||
      stack[index].appId === snapshot.appId;
    if (sameScreen && sameAppIdentity) {
      const snapshotTitle = normalizeNavText(snapshot.screenTitle);
      const frameTitle = normalizeNavText(stack[index].state.screenTitle);
      if (snapshotTitle && frameTitle && snapshotTitle !== frameTitle) {
        continue;
      }
      return index;
    }
  }

  if (snapshot.screenTitle && !isLikelyBundleId(snapshot.screenTitle)) {
    const normalizedSnapshotTitle = normalizeTitleForMatch(snapshot.screenTitle);
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const frameTitle = stack[index].state.screenTitle;
      if (frameTitle && !isLikelyBundleId(frameTitle) && normalizeTitleForMatch(frameTitle) === normalizedSnapshotTitle) {
        const sameAppIdentity =
          snapshot.appId === undefined ||
          stack[index].appId === undefined ||
          stack[index].appId === snapshot.appId;
        if (sameAppIdentity) {
          console.log(
            `[FRAME-RESUME] screenId drift detected: matched by title "${frameTitle}" at depth=${index} ` +
            `(snapshot screenId=${snapshot.screenId}, frame screenId=${stack[index].state.screenId})`,
          );
          return index;
        }
      }
    }
  }

  return -1;
}

export function reconcileStackToSnapshot(
  stack: Frame[],
  snapshot: PageSnapshot,
  targetAppId: string,
  options?: { allowRootReset?: boolean },
): Frame | undefined {
  if (stack.length === 0) {
    return undefined;
  }

  const ancestorFrameIndex = findAncestorFrameIndex(stack, snapshot);

  if (ancestorFrameIndex >= 0) {
    while (stack.length - 1 > ancestorFrameIndex) {
      stack.pop();
    }

    const resumedFrame = stack[ancestorFrameIndex];
    const preserveScrollState = shouldPreserveScrollStateOnReconcile(
      resumedFrame,
      snapshot,
      targetAppId,
    );
    resumedFrame.state = {
      screenId: snapshot.screenId,
      screenTitle: snapshot.screenTitle,
      pageContextType: snapshot.pageContext?.type,
      structureHash: hashUiStructure(snapshot.uiTree),
    };
    resumedFrame.appId = snapshot.appId ?? resumedFrame.appId ?? targetAppId;
    resumedFrame.isExternalApp = false;
    if (resumedFrame.scrollState && !preserveScrollState) {
      console.log(`[FRAME-RECONCILE] Invalidating scrollState at depth=${resumedFrame.depth}`);
      resumedFrame.scrollState = undefined;
    }
    return resumedFrame;
  }

  if (snapshot.appId === targetAppId && options?.allowRootReset !== false) {
    console.log(
      `[FRAME-RESUME] No ancestor match for "${snapshot.screenTitle ?? snapshot.screenId}". ` +
      `Resetting to root frame (was ${stack.length} frames).`,
    );
    while (stack.length > 1) {
      stack.pop();
    }
    const rootFrame = stack[0];
    rootFrame.state = {
      screenId: snapshot.screenId,
      screenTitle: snapshot.screenTitle,
      pageContextType: snapshot.pageContext?.type,
      structureHash: hashUiStructure(snapshot.uiTree),
    };
    rootFrame.appId = snapshot.appId ?? rootFrame.appId ?? targetAppId;
    rootFrame.isExternalApp = false;
    rootFrame.depth = 0;
    rootFrame.path = [];
    rootFrame.elementIndex = 0;
    rootFrame.elements = [];
    // Invalidate stale scroll state
    if (rootFrame.scrollState) {
      console.log(`[FRAME-RECONCILE] Invalidating root frame scrollState`);
      rootFrame.scrollState = undefined;
    }
    return rootFrame;
  }

  return undefined;
}
