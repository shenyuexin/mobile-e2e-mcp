import type {
  DiagnoseNetworkFailureData,
  DiagnoseNetworkFailureInput,
  JsNetworkEvent,
  NetworkFailureDiagnosisClassification,
  NetworkFailureDiagnosisConfidence,
  NetworkFailureRequest,
  NetworkFailureReleaseAssessment,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";
import { inspectNetworkPolicyWithMaestro } from "./network-policy-inspection.js";

function isFailedNetworkEvent(event: JsNetworkEvent): boolean {
  return Boolean(event.errorText) || (typeof event.status === "number" && event.status >= 400);
}

function selectFailedRequest(input: DiagnoseNetworkFailureInput): NetworkFailureRequest | undefined {
  if (input.failedRequest) {
    return { source: "manual", ...input.failedRequest };
  }
  const event = input.events?.find(isFailedNetworkEvent);
  if (!event) return undefined;
  return {
    url: event.url,
    method: event.method,
    status: event.status,
    statusText: event.statusText,
    errorText: event.errorText,
    source: "js_debug",
  };
}

function buildReleaseAssessment(input: DiagnoseNetworkFailureInput): NetworkFailureReleaseAssessment {
  const releaseHint = input.releaseHint ?? "unknown";
  if (releaseHint === "release") {
    return { releaseHint, releaseLike: true, source: "release_hint" };
  }
  if (releaseHint === "debug") {
    return { releaseHint, releaseLike: false, source: "release_hint" };
  }
  const hasPolicyEvidence = Boolean(
    input.artifactPath ||
    input.androidManifestPath ||
    input.androidNetworkSecurityConfigPath ||
    input.iosInfoPlistPath,
  );
  return {
    releaseHint,
    releaseLike: hasPolicyEvidence,
    source: hasPolicyEvidence ? "policy_evidence" : "unknown",
  };
}

function classifyInvalidRequest(): NetworkFailureDiagnosisClassification {
  return {
    reason: "invalid_or_missing_failed_request",
    policyRelated: false,
    summary: "No valid failed network request URL was provided or captured.",
  };
}

function classifyHttps(): NetworkFailureDiagnosisClassification {
  return {
    reason: "https_not_cleartext_policy_related",
    policyRelated: false,
    summary: "The failed request uses HTTPS, so Android cleartext and iOS ATS HTTP policy are not the likely blocker.",
  };
}

function classifyStatusError(status: number): NetworkFailureDiagnosisClassification {
  return {
    reason: "http_status_error",
    policyRelated: false,
    summary: `The request reached HTTP status ${String(status)}, so release HTTP policy is not the primary failure cause.`,
  };
}

function classifyPolicyAllowed(request: NetworkFailureRequest): NetworkFailureDiagnosisClassification {
  if (request.errorText && /\b(dns|host|timeout|timed out|unreachable|offline)\b/i.test(request.errorText)) {
    return {
      reason: "backend_or_dns_unreachable",
      policyRelated: false,
      summary: "HTTP is allowed by release policy; the remaining evidence points to backend, DNS, or connectivity failure.",
    };
  }
  return {
    reason: "http_allowed_by_policy_failure_elsewhere",
    policyRelated: false,
    summary: "HTTP is allowed by release policy for this endpoint; inspect backend response, DNS, connectivity, or app runtime evidence next.",
  };
}

function confidenceFor(classification: NetworkFailureDiagnosisClassification, releaseAssessment: NetworkFailureReleaseAssessment): NetworkFailureDiagnosisConfidence {
  if (classification.reason === "invalid_or_missing_failed_request") return "low";
  if (classification.reason === "policy_evidence_missing" || classification.reason === "artifact_decode_unavailable") return "low";
  if (classification.policyRelated && releaseAssessment.releaseLike) return "high";
  if (classification.policyRelated) return "medium";
  return "medium";
}

function suggestionsFor(classification: NetworkFailureDiagnosisClassification): string[] {
  switch (classification.reason) {
    case "likely_android_cleartext_blocked":
      return ["Use HTTPS or add a narrowly scoped Android network-security-config domain rule for this HTTP host."];
    case "likely_ios_ats_blocked":
      return ["Use HTTPS or add a narrowly scoped iOS ATS exception domain for this HTTP host."];
    case "http_status_error":
      return ["Inspect backend status, response body, auth/session state, and server logs for the failing endpoint."];
    case "backend_or_dns_unreachable":
      return ["Run probe_network_readiness for this backend host and inspect DNS/connectivity evidence before retrying."];
    case "http_allowed_by_policy_failure_elsewhere":
      return ["Release HTTP policy allows this endpoint; continue with runtime logs, backend reachability, and app-layer error handling."];
    case "https_not_cleartext_policy_related":
      return ["Investigate TLS, backend availability, DNS, or app-layer handling; cleartext/ATS HTTP policy does not apply to this HTTPS request."];
    case "artifact_decode_unavailable":
      return ["Provide decoded AndroidManifest.xml / network_security_config.xml or Info.plist evidence for deterministic policy attribution."];
    case "policy_evidence_missing":
      return ["Provide artifactPath or decoded release policy files so the diagnosis can distinguish policy blockers from other network failures."];
    case "invalid_or_missing_failed_request":
      return ["Pass failedRequest.url or provide capture_js_network_events output through the events field."];
  }
}

export async function diagnoseNetworkFailureWithMaestro(input: DiagnoseNetworkFailureInput): Promise<ToolResult<DiagnoseNetworkFailureData>> {
  const startTime = Date.now();
  const analyzedRequest = selectFailedRequest(input);
  const releaseAssessment = buildReleaseAssessment(input);

  let classification: NetworkFailureDiagnosisClassification;
  let policyInspection: DiagnoseNetworkFailureData["policyInspection"];

  let parsedUrl: URL | undefined;
  if (analyzedRequest?.url) {
    try {
      parsedUrl = new URL(analyzedRequest.url);
    } catch {
      parsedUrl = undefined;
    }
  }

  if (!analyzedRequest || !parsedUrl) {
    classification = classifyInvalidRequest();
  } else if (parsedUrl.protocol === "https:") {
    classification = classifyHttps();
  } else if (parsedUrl.protocol !== "http:") {
    classification = classifyInvalidRequest();
  } else {
    const policyResult = await inspectNetworkPolicyWithMaestro({
      sessionId: input.sessionId ?? `network-failure-diagnosis-${Date.now()}`,
      platform: input.platform,
      urls: [parsedUrl.href],
      artifactPath: input.artifactPath,
      androidManifestPath: input.androidManifestPath,
      androidNetworkSecurityConfigPath: input.androidNetworkSecurityConfigPath,
      iosInfoPlistPath: input.iosInfoPlistPath,
      dryRun: input.dryRun,
    });
    policyInspection = policyResult.data;
    const finding = policyInspection.findings[0];

    if (finding?.reason === "artifact_decode_unavailable") {
      classification = {
        reason: "artifact_decode_unavailable",
        policyRelated: false,
        summary: "The artifact could not be decoded enough to determine release HTTP policy.",
      };
    } else if (finding?.reason === "policy_evidence_missing" || finding?.status === "unknown") {
      classification = {
        reason: "policy_evidence_missing",
        policyRelated: false,
        summary: "Release HTTP policy evidence is missing or inconclusive for the failed request.",
      };
    } else if (finding?.status === "blocked") {
      classification = {
        reason: input.platform === "ios" ? "likely_ios_ats_blocked" : "likely_android_cleartext_blocked",
        policyRelated: true,
        summary: input.platform === "ios"
          ? "The failed HTTP request is blocked by iOS ATS release policy evidence."
          : "The failed HTTP request is blocked by Android cleartext release policy evidence.",
      };
    } else if (typeof analyzedRequest.status === "number" && analyzedRequest.status >= 400) {
      classification = classifyStatusError(analyzedRequest.status);
    } else {
      classification = classifyPolicyAllowed(analyzedRequest);
    }
  }

  const confidence = confidenceFor(classification, releaseAssessment);

  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId ?? `network-failure-diagnosis-${Date.now()}`,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      platform: input.platform,
      analyzedRequest,
      classification,
      confidence,
      policyInspection,
      releaseAssessment,
      evidence: policyInspection?.evidence ?? [],
    },
    nextSuggestions: suggestionsFor(classification),
  };
}
