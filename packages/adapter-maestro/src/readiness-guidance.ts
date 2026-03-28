import type { FailureAttribution, Platform, SkillGuidedRemediation } from "@mobile-e2e-mcp/contracts";

interface BuildReadinessGuidanceInput {
  platform?: Platform;
  attribution?: FailureAttribution;
}

function baselineRoute(): string[] {
  return ["mobile-e2e-readiness-baseline"];
}

export function buildSkillGuidedRemediation(
  input: BuildReadinessGuidanceInput,
): SkillGuidedRemediation {
  const affectedLayer = input.attribution?.affectedLayer ?? "unknown";

  if (input.platform === "android") {
    if (affectedLayer === "interruption" || affectedLayer === "ui_state") {
      return {
        route: [...baselineRoute(), "android-e2e-readiness"],
        mostLikelyGap: "Android blocked or not-yet-actionable state is under-specified for this action.",
        why: "The current evidence fits a visible-but-not-actionable Android state more than a pure Compose timing issue.",
        askForNext: [
          "Capture a failing screen summary or hierarchy at the action moment.",
          "Check whether a dialog, sheet, OEM blocker, or protected state was present.",
        ],
        firstFix: "Expose blocked-vs-ready state before tuning waits or retries.",
        handoffSkill: "android-development",
      };
    }

    return {
      route: [...baselineRoute(), "android-e2e-readiness"],
      mostLikelyGap: "Android contract gap around deterministic entry, stable hooks, or hybrid ownership.",
      why: "The failure pattern is more consistent with a weak Android readiness contract than with a simple selector-vs-timing choice.",
      askForNext: [
        "Verify whether the flow started from a stable Android entry/reset path.",
        "Check whether the target is durably addressable and clearly owned across Compose/View boundaries.",
      ],
      firstFix: "Fix the Android entry/hook ownership contract before adding more waits.",
      handoffSkill: "android-development",
    };
  }

  if (input.platform === "ios") {
    if (affectedLayer === "interruption" || affectedLayer === "ui_state") {
      return {
        route: [...baselineRoute(), "ios-e2e-readiness"],
        mostLikelyGap: "iOS blocked or interrupted state is under-specified for this action.",
        why: "The current evidence fits a visible-but-blocked iOS flow more than a pure SwiftUI timing issue.",
        askForNext: [
          "Capture a failing screen summary or hierarchy at the action moment.",
          "Check whether a modal, permission prompt, consent state, or interruption was present.",
        ],
        firstFix: "Expose blocked/interrupted state before tuning waits or transition handling.",
        handoffSkill: "ios-development",
      };
    }

    return {
      route: [...baselineRoute(), "ios-e2e-readiness"],
      mostLikelyGap: "iOS contract gap around launch/reset, stable identifiers, or mixed ownership.",
      why: "The failure pattern is more consistent with a weak iOS readiness contract than with a simple SwiftUI timing explanation.",
      askForNext: [
        "Verify whether the flow started from a clean iOS launch/reset path.",
        "Check whether the target is durably identifiable and clearly owned across SwiftUI/UIKit boundaries.",
      ],
      firstFix: "Fix launch/reset or stable identifier ownership before adding more waits.",
      handoffSkill: "ios-development",
    };
  }

  return {
    route: baselineRoute(),
    mostLikelyGap: "Readiness contract gap around entry, locators, or actionable state.",
    why: "The failure signal fits a contract problem better than a blind timing or flaky-app label.",
    askForNext: [
      "Collect action evidence or a screen summary from the failing moment.",
      "Check whether retry passed only after a meaningful state change.",
    ],
    firstFix: "Fix the app-side readiness contract before adding more retries.",
  };
}
