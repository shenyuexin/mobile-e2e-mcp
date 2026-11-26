import type { BacktrackLadderContext } from "./backtrack-core.js";
import { tryCancelCloseFamily, tryDialogControlFamily, trySelectorFamily } from "./backtrack-core.js";

export async function runIosBacktrackLadder(ctx: BacktrackLadderContext): Promise<boolean> {
  const affordance = await ctx.detectBackAffordance();
  const isDialogLike = affordance.isDialogLike === true;
  const isPopoverLike = affordance.isPopoverLike === true;

  if (isPopoverLike) {
    if (
      affordance.dismissButtonLabels &&
      affordance.dismissButtonLabels.length > 0 &&
      ctx.tryPopoverDismissButtons &&
      await ctx.tryPopoverDismissButtons(affordance.dismissButtonLabels)
    ) {
      return true;
    }

    if (await tryCancelCloseFamily(ctx)) {
      return true;
    }

    if (await tryDialogControlFamily(ctx)) {
      return true;
    }

    if (ctx.tryPopoverDismissTap && await ctx.tryPopoverDismissTap(affordance)) {
      return true;
    }
  }

  if (await trySelectorFamily(ctx, affordance)) {
    return true;
  }

  if (!isDialogLike && !isPopoverLike && await ctx.tryPointBandBack(affordance.navBarFrame)) {
    return true;
  }

  if (!isPopoverLike && await tryCancelCloseFamily(ctx)) {
    return true;
  }

  if (!isPopoverLike && await tryDialogControlFamily(ctx)) {
    return true;
  }

  if (await ctx.tryTopBarBackCandidates()) {
    return true;
  }

  if (await ctx.tryScreenSummaryBackAffordance()) {
    return true;
  }

  if (await ctx.tryNavigateBack("navigate_back:edge_swipe", { iosStrategy: "edge_swipe" })) {
    return true;
  }

  if ((isDialogLike || isPopoverLike) && await ctx.tryPointBandBack(affordance.navBarFrame)) {
    return true;
  }

  if (await ctx.tryNavBarCoordinateBack()) {
    return true;
  }

  await ctx.logBackFailureEvidence();
  ctx.logWarn(
    `all iOS strategies failed for parentTitle="${ctx.parentTitle ?? "<none>"}" ` +
    `(${isPopoverLike ? "popover-dismiss -> cancel/close/dismiss -> outside-tap -> selector -> topbar/summary -> edge_swipe -> point-band" : isDialogLike ? "selector -> cancel/dialog -> topbar/summary -> edge_swipe -> point-band" : "selector -> point-band -> cancel/dialog -> topbar/summary -> edge_swipe -> nav points"})`,
  );
  return false;
}
