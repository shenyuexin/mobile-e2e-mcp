import { normalizeOcrText } from "../resolver/resolve-text-target.js";
import type { OcrOutput, OcrVerificationCheckName, VerifyOcrActionInput, VerifyOcrActionResult } from "../types.js";

function hasText(output: OcrOutput | undefined, targetText: string): boolean {
  const normalizedTarget = normalizeOcrText(targetText);
  if (!normalizedTarget) {
    return false;
  }
  return (output?.blocks ?? []).some((block) => normalizeOcrText(block.text) === normalizedTarget);
}

function normalizeExpectedTexts(expectedText: string | string[] | undefined): string[] {
  if (expectedText === undefined) {
    return [];
  }
  const values = Array.isArray(expectedText) ? expectedText : [expectedText];
  return values.map((value) => normalizeOcrText(value)).filter(Boolean);
}

export function didTextDisappear(input: VerifyOcrActionInput): boolean {
  if (!input.targetText || !input.beforeOcr || !input.afterOcr) {
    return false;
  }
  return hasText(input.beforeOcr, input.targetText) && !hasText(input.afterOcr, input.targetText);
}

export function didExpectedTextAppear(input: VerifyOcrActionInput): boolean {
  const expected = normalizeExpectedTexts(input.expectedText);
  if (expected.length === 0 || !input.afterOcr) {
    return false;
  }
  const beforeTexts = new Set((input.beforeOcr?.blocks ?? []).map((block) => normalizeOcrText(block.text)).filter(Boolean));
  const afterTexts = new Set((input.afterOcr?.blocks ?? []).map((block) => normalizeOcrText(block.text)).filter(Boolean));
  return expected.some((value) => afterTexts.has(value) && !beforeTexts.has(value));
}

export function didStateChange(input: VerifyOcrActionInput): boolean {
  if (!input.preState || !input.postState) {
    return false;
  }
  return JSON.stringify(input.preState) !== JSON.stringify(input.postState);
}

export function didDeterministicLocatorBecomeAvailable(input: VerifyOcrActionInput): boolean {
  if (input.deterministicLocatorAvailable === true) {
    return true;
  }
  return input.locatorAvailableBefore === false && input.locatorAvailableAfter === true;
}

function buildCheck(check: OcrVerificationCheckName, passed: boolean, detail: string) {
  return { check, passed, detail };
}

export function verifyOcrAction(input: VerifyOcrActionInput): VerifyOcrActionResult {
  const checks = [
    buildCheck(
      "text_disappeared",
      didTextDisappear(input),
      input.targetText && input.beforeOcr && input.afterOcr
        ? "Target text no longer appears in the post-action OCR output."
        : "Text disappearance check was not applicable.",
    ),
    buildCheck(
      "expected_text_appeared",
      didExpectedTextAppear(input),
      input.expectedText && input.afterOcr
        ? "Expected next text appeared only after the OCR-driven action."
        : "Expected-text appearance check was not applicable.",
    ),
    buildCheck(
      "state_changed",
      didStateChange(input),
      input.preState && input.postState
        ? "Screen summary changed after the OCR-driven action."
        : "State-change check was not applicable.",
    ),
    buildCheck(
      "deterministic_locator_available",
      didDeterministicLocatorBecomeAvailable(input),
      input.deterministicLocatorAvailable !== undefined || input.locatorAvailableAfter !== undefined
        ? "A deterministic locator became available after the OCR-driven action."
        : "Deterministic-locator check was not applicable.",
    ),
  ];

  const successfulChecks = checks.filter((check) => check.passed).map((check) => check.check);
  const applicableChecks = checks.filter((check) => !check.detail.endsWith("not applicable."));
  const verified = successfulChecks.length > 0;

  return {
    verified,
    status: applicableChecks.length === 0 ? "not_run" : verified ? "verified" : "not_verified",
    summary: applicableChecks.length === 0
      ? "No OCR post-action verification signals were available."
      : verified
        ? `OCR post-action verification passed via ${successfulChecks.join(", ")}.`
        : "OCR post-action verification failed; no expected success signal was observed.",
    checks,
    successfulChecks,
    failureReasons: verified
      ? []
      : applicableChecks.length === 0
        ? ["No verification signals were supplied."]
        : applicableChecks.filter((check) => !check.passed).map((check) => check.detail),
  };
}
