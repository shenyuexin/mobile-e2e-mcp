import { readFile } from "node:fs/promises";
import type {
  InspectNetworkPolicyData,
  InspectNetworkPolicyInput,
  NetworkPolicyEndpointFinding,
  NetworkPolicyEvidence,
  NetworkPolicyInspectionStatus,
  Platform,
  ToolResult,
} from "@mobile-e2e-mcp/contracts";
import { REASON_CODES } from "@mobile-e2e-mcp/contracts";

interface Endpoint {
  endpoint: string;
  host?: string;
  scheme?: string;
  invalid?: boolean;
}

interface AndroidDomainRule {
  domain: string;
  includeSubdomains: boolean;
  cleartextPermitted: boolean;
}

interface AndroidPolicy {
  manifestProvided: boolean;
  usesCleartextTraffic?: boolean;
  networkSecurityConfigRef?: string;
  baseCleartextPermitted?: boolean;
  domainRules: AndroidDomainRule[];
  artifactUnsupported: boolean;
}

interface IosExceptionRule {
  domain: string;
  includeSubdomains: boolean;
  allowsInsecureLoads: boolean;
}

interface IosPolicy {
  plistProvided: boolean;
  allowsArbitraryLoads: boolean;
  exceptionRules: IosExceptionRule[];
  artifactUnsupported: boolean;
}

const XML_TRUE = /<true\s*\/>/i;

function normalizeEndpoints(input: InspectNetworkPolicyInput): Endpoint[] {
  const raw = [
    ...(input.urls ?? []),
    ...(input.domains ?? []).map((domain) => `http://${domain}`),
  ].map((value) => value.trim()).filter(Boolean);

  return raw.map((endpoint) => {
    try {
      const parsed = new URL(endpoint);
      return {
        endpoint,
        host: parsed.hostname.toLowerCase(),
        scheme: parsed.protocol.replace(/:$/, "").toLowerCase(),
      };
    } catch {
      return { endpoint, invalid: true };
    }
  });
}

function readXmlAttribute(xml: string, attrName: string): string | undefined {
  const escaped = attrName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = xml.match(new RegExp(`(?:android:)?${escaped}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1];
}

async function readOptionalText(pathValue: string | undefined, kind: NetworkPolicyEvidence["kind"]): Promise<{ content?: string; evidence: NetworkPolicyEvidence }> {
  if (!pathValue) {
    return {
      evidence: {
        kind,
        status: "not_provided",
        summary: `${kind} path was not provided.`,
      },
    };
  }

  try {
    return {
      content: await readFile(pathValue, "utf8"),
      evidence: {
        kind,
        path: pathValue,
        status: "read",
        summary: `Read ${kind} from ${pathValue}.`,
      },
    };
  } catch {
    return {
      evidence: {
        kind,
        path: pathValue,
        status: "missing",
        summary: `Could not read ${kind} at ${pathValue}.`,
      },
    };
  }
}

function parseAndroidDomainRules(xml: string): AndroidDomainRule[] {
  const rules: AndroidDomainRule[] = [];
  const domainConfigPattern = /<domain-config\b([^>]*)>([\s\S]*?)<\/domain-config>/gi;
  let configMatch: RegExpExecArray | null;
  while ((configMatch = domainConfigPattern.exec(xml)) !== null) {
    const cleartextValue = readXmlAttribute(configMatch[1] ?? "", "cleartextTrafficPermitted");
    const cleartextPermitted = cleartextValue === "true";
    const domainPattern = /<domain\b([^>]*)>([^<]+)<\/domain>/gi;
    let domainMatch: RegExpExecArray | null;
    while ((domainMatch = domainPattern.exec(configMatch[2] ?? "")) !== null) {
      rules.push({
        domain: (domainMatch[2] ?? "").trim().toLowerCase(),
        includeSubdomains: readXmlAttribute(domainMatch[1] ?? "", "includeSubdomains") === "true",
        cleartextPermitted,
      });
    }
  }
  return rules;
}

function parseAndroidBaseCleartext(xml: string): boolean | undefined {
  const match = xml.match(/<base-config\b([^>]*)>/i);
  const value = match ? readXmlAttribute(match[1] ?? "", "cleartextTrafficPermitted") : undefined;
  return value === undefined ? undefined : value === "true";
}

function parseAndroidPolicy(params: {
  manifestContent?: string;
  networkSecurityConfigContent?: string;
  artifactPath?: string;
}): AndroidPolicy {
  const manifest = params.manifestContent;
  const usesCleartext = manifest ? readXmlAttribute(manifest, "usesCleartextTraffic") : undefined;
  return {
    manifestProvided: Boolean(manifest),
    usesCleartextTraffic: usesCleartext === undefined ? undefined : usesCleartext === "true",
    networkSecurityConfigRef: manifest ? readXmlAttribute(manifest, "networkSecurityConfig") : undefined,
    baseCleartextPermitted: params.networkSecurityConfigContent ? parseAndroidBaseCleartext(params.networkSecurityConfigContent) : undefined,
    domainRules: params.networkSecurityConfigContent ? parseAndroidDomainRules(params.networkSecurityConfigContent) : [],
    artifactUnsupported: Boolean(params.artifactPath && !manifest),
  };
}

function extractPlistDictAfterKey(xml: string, key: string): string | undefined {
  const keyIndex = xml.search(new RegExp(`<key>\\s*${key}\\s*<\\/key>`, "i"));
  if (keyIndex < 0) return undefined;
  const afterKey = xml.slice(keyIndex);
  const dictStartMatch = afterKey.match(/<dict>/i);
  if (!dictStartMatch || dictStartMatch.index === undefined) return undefined;
  const start = keyIndex + dictStartMatch.index + dictStartMatch[0].length;
  let depth = 1;
  const tokenPattern = /<\/?dict>/gi;
  tokenPattern.lastIndex = start;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(xml)) !== null) {
    if (token[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return xml.slice(start, token.index);
      }
    } else {
      depth += 1;
    }
  }
  return undefined;
}

function plistBooleanAfterKey(xml: string, key: string): boolean | undefined {
  const keyMatch = xml.match(new RegExp(`<key>\\s*${key}\\s*<\\/key>\\s*(<true\\s*\\/>|<false\\s*\\/>)`, "i"));
  if (!keyMatch) return undefined;
  return XML_TRUE.test(keyMatch[1] ?? "");
}

function parseIosExceptionRules(plistContent: string): IosExceptionRule[] {
  const exceptions = extractPlistDictAfterKey(plistContent, "NSExceptionDomains");
  if (!exceptions) return [];

  const rules: IosExceptionRule[] = [];
  const domainPattern = /<key>\s*([^<]+)\s*<\/key>\s*<dict>([\s\S]*?)<\/dict>/gi;
  let match: RegExpExecArray | null;
  while ((match = domainPattern.exec(exceptions)) !== null) {
    const domain = (match[1] ?? "").trim().toLowerCase();
    const body = match[2] ?? "";
    const allowsInsecureLoads =
      plistBooleanAfterKey(body, "NSExceptionAllowsInsecureHTTPLoads") === true ||
      plistBooleanAfterKey(body, "NSTemporaryExceptionAllowsInsecureHTTPLoads") === true;
    rules.push({
      domain,
      includeSubdomains: plistBooleanAfterKey(body, "NSIncludesSubdomains") === true,
      allowsInsecureLoads,
    });
  }
  return rules;
}

function parseIosPolicy(params: { plistContent?: string; artifactPath?: string }): IosPolicy {
  const plist = params.plistContent;
  return {
    plistProvided: Boolean(plist),
    allowsArbitraryLoads: plist ? plistBooleanAfterKey(plist, "NSAllowsArbitraryLoads") === true : false,
    exceptionRules: plist ? parseIosExceptionRules(plist) : [],
    artifactUnsupported: Boolean(params.artifactPath && !plist),
  };
}

function hostMatchesRule(host: string | undefined, domain: string, includeSubdomains: boolean): boolean {
  if (!host) return false;
  const normalizedDomain = domain.toLowerCase();
  return host === normalizedDomain || (includeSubdomains && host.endsWith(`.${normalizedDomain}`));
}

function evidenceRefsForPlatform(platform: Platform, evidence: NetworkPolicyEvidence[]): string[] {
  const relevantKinds: NetworkPolicyEvidence["kind"][] = platform === "android"
    ? ["android_manifest", "android_network_security_config", "artifact"]
    : ["ios_info_plist", "artifact"];
  return evidence
    .filter((item) => relevantKinds.includes(item.kind) && item.status === "read")
    .map((item) => item.path ?? item.kind);
}

function buildBaseFinding(endpoint: Endpoint, evidenceRefs: string[]): Pick<NetworkPolicyEndpointFinding, "endpoint" | "host" | "scheme" | "evidenceRefs"> {
  return {
    endpoint: endpoint.endpoint,
    host: endpoint.host,
    scheme: endpoint.scheme,
    evidenceRefs,
  };
}

function evaluateAndroidEndpoint(endpoint: Endpoint, policy: AndroidPolicy, evidenceRefs: string[]): NetworkPolicyEndpointFinding {
  const base = buildBaseFinding(endpoint, evidenceRefs);
  if (endpoint.invalid) {
    return { ...base, status: "unknown", reason: "invalid_endpoint" };
  }
  if (endpoint.scheme === "https") {
    return { ...base, status: "not_applicable", reason: "https_endpoint_not_subject_to_cleartext_policy" };
  }
  if (endpoint.scheme !== "http") {
    return { ...base, status: "not_applicable", reason: "https_endpoint_not_subject_to_cleartext_policy" };
  }
  if (policy.artifactUnsupported) {
    return { ...base, status: "unknown", reason: "artifact_decode_unavailable" };
  }
  if (!policy.manifestProvided) {
    return { ...base, status: "unknown", reason: "policy_evidence_missing" };
  }
  if (policy.usesCleartextTraffic === true) {
    return { ...base, status: "allowed", reason: "android_cleartext_permitted", matchedRule: "usesCleartextTraffic=true" };
  }
  const domainRule = policy.domainRules.find((rule) => hostMatchesRule(endpoint.host, rule.domain, rule.includeSubdomains));
  if (domainRule) {
    return domainRule.cleartextPermitted
      ? { ...base, status: "allowed", reason: "android_cleartext_permitted", matchedRule: `networkSecurityConfig:${domainRule.domain}` }
      : { ...base, status: "blocked", reason: "android_cleartext_not_permitted", matchedRule: `networkSecurityConfig:${domainRule.domain}` };
  }
  if (policy.baseCleartextPermitted === true) {
    return { ...base, status: "allowed", reason: "android_cleartext_permitted", matchedRule: "networkSecurityConfig:base-config" };
  }
  return { ...base, status: "blocked", reason: "android_cleartext_not_permitted" };
}

function evaluateIosEndpoint(endpoint: Endpoint, policy: IosPolicy, evidenceRefs: string[]): NetworkPolicyEndpointFinding {
  const base = buildBaseFinding(endpoint, evidenceRefs);
  if (endpoint.invalid) {
    return { ...base, status: "unknown", reason: "invalid_endpoint" };
  }
  if (endpoint.scheme === "https") {
    return { ...base, status: "not_applicable", reason: "https_endpoint_not_subject_to_cleartext_policy" };
  }
  if (endpoint.scheme !== "http") {
    return { ...base, status: "not_applicable", reason: "https_endpoint_not_subject_to_cleartext_policy" };
  }
  if (policy.artifactUnsupported) {
    return { ...base, status: "unknown", reason: "artifact_decode_unavailable" };
  }
  if (!policy.plistProvided) {
    return { ...base, status: "unknown", reason: "policy_evidence_missing" };
  }
  if (policy.allowsArbitraryLoads) {
    return { ...base, status: "allowed", reason: "ios_ats_allows_http", matchedRule: "NSAllowsArbitraryLoads=true" };
  }
  const exceptionRule = policy.exceptionRules.find((rule) => rule.allowsInsecureLoads && hostMatchesRule(endpoint.host, rule.domain, rule.includeSubdomains));
  if (exceptionRule) {
    return { ...base, status: "allowed", reason: "ios_ats_allows_http", matchedRule: `NSExceptionDomains:${exceptionRule.domain}` };
  }
  return { ...base, status: "blocked", reason: "ios_ats_requires_https" };
}

function summarizeStatus(findings: NetworkPolicyEndpointFinding[]): NetworkPolicyInspectionStatus {
  if (findings.some((finding) => finding.status === "blocked")) return "blocked";
  if (findings.some((finding) => finding.status === "unknown")) return "unknown";
  if (findings.length > 0 && findings.every((finding) => finding.status === "not_applicable")) return "not_applicable";
  if (findings.length > 0 && findings.every((finding) => finding.status === "allowed" || finding.status === "not_applicable")) return "allowed";
  return "unknown";
}

function buildNextSuggestions(platform: Platform, findings: NetworkPolicyEndpointFinding[]): string[] {
  if (findings.some((finding) => finding.reason === "policy_evidence_missing")) {
    return platform === "android"
      ? ["Provide androidManifestPath and, when present, androidNetworkSecurityConfigPath to inspect release cleartext policy."]
      : ["Provide iosInfoPlistPath to inspect ATS release policy."];
  }
  if (findings.some((finding) => finding.reason === "artifact_decode_unavailable")) {
    return ["Provide decoded AndroidManifest.xml / network_security_config.xml or Info.plist paths for deterministic inspection."];
  }
  if (findings.some((finding) => finding.status === "blocked")) {
    return platform === "android"
      ? ["Use HTTPS or add a narrowly scoped network security config domain rule for required HTTP hosts."]
      : ["Use HTTPS or add a narrowly scoped ATS exception domain for required HTTP hosts."];
  }
  return ["Network release policy inspection completed; no plain-HTTP policy blocker was detected for the provided endpoints."];
}

function buildLimitations(input: InspectNetworkPolicyInput): string[] {
  const limitations = [
    "Static policy inspection only; backend reachability remains covered by probe_network_readiness.",
    "The tool does not mutate app configuration or relax platform security policy.",
  ];
  if (input.artifactPath) {
    limitations.push("Built artifact decoding is conditional; provide decoded config files when local platform tooling cannot expose readable policy files.");
  }
  return limitations;
}

export async function inspectNetworkPolicyWithMaestro(input: InspectNetworkPolicyInput): Promise<ToolResult<InspectNetworkPolicyData>> {
  const startTime = Date.now();
  const platform = input.platform;
  const endpoints = normalizeEndpoints(input);
  const evidence: NetworkPolicyEvidence[] = [];

  if (input.artifactPath) {
    evidence.push({
      kind: "artifact",
      path: input.artifactPath,
      status: "unsupported",
      summary: "Direct artifact decoding is conditional in this runtime; decoded policy file paths are required for deterministic inspection.",
    });
  }

  let findings: NetworkPolicyEndpointFinding[];
  if (platform === "android") {
    const manifest = await readOptionalText(input.androidManifestPath, "android_manifest");
    const networkConfig = await readOptionalText(input.androidNetworkSecurityConfigPath, "android_network_security_config");
    evidence.push(manifest.evidence, networkConfig.evidence);
    const policy = parseAndroidPolicy({
      manifestContent: manifest.content,
      networkSecurityConfigContent: networkConfig.content,
      artifactPath: input.artifactPath,
    });
    const refs = evidenceRefsForPlatform(platform, evidence);
    findings = endpoints.map((endpoint) => evaluateAndroidEndpoint(endpoint, policy, refs));
  } else {
    const plist = await readOptionalText(input.iosInfoPlistPath, "ios_info_plist");
    evidence.push(plist.evidence);
    const policy = parseIosPolicy({ plistContent: plist.content, artifactPath: input.artifactPath });
    const refs = evidenceRefsForPlatform(platform, evidence);
    findings = endpoints.map((endpoint) => evaluateIosEndpoint(endpoint, policy, refs));
  }

  const overallStatus = summarizeStatus(findings);
  return {
    status: "success",
    reasonCode: REASON_CODES.ok,
    sessionId: input.sessionId,
    durationMs: Date.now() - startTime,
    attempts: 1,
    artifacts: [],
    data: {
      platform,
      checkedEndpoints: endpoints.map((endpoint) => endpoint.endpoint),
      overallStatus,
      findings,
      evidence,
      supportLevel: input.artifactPath ? "conditional" : "full",
      limitations: buildLimitations(input),
    },
    nextSuggestions: buildNextSuggestions(platform, findings),
  };
}
