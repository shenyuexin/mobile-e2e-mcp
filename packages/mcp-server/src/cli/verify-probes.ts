import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type VerifyProbeOp = "lte" | "lt" | "gte" | "gt" | "eq" | "neq" | "exists";

export interface VerifyProbeAssertion {
  path: string;
  op: VerifyProbeOp;
  value?: number | string | boolean;
  maxRatioOfBaseline?: number;
  baselineMargin?: number;
}

export interface VerifyProbeDefinition {
  name: string;
  url: string;
  timeoutMs?: number;
  assertions?: VerifyProbeAssertion[];
}

export interface VerifyProbeConfigFile {
  baselinePath?: string;
  updateBaseline?: boolean;
  probes: VerifyProbeDefinition[];
}

export interface VerifyProbeResultEntry {
  name: string;
  url: string;
  status: "passed" | "failed" | "skipped_dry_run";
  httpStatus?: number;
  durationMs: number;
  rawJsonRelPath?: string;
  metrics: Record<string, number | string | boolean | null>;
  failures: string[];
}

export interface VerifyProbesSummary {
  enabled: boolean;
  status: "passed" | "failed" | "skipped_dry_run" | "skipped";
  total: number;
  passed: number;
  failed: number;
  baselinePath?: string;
  baselineUpdated?: boolean;
  entries: VerifyProbeResultEntry[];
}

export type FetchProbeFn = (
  url: string,
  timeoutMs: number,
) => Promise<{ ok: boolean; status: number; bodyText: string; error?: string }>;

const VALID_PROBE_OPS = new Set<VerifyProbeOp>(["lte", "lt", "gte", "gt", "eq", "neq", "exists"]);
const DEFAULT_PROBE_TIMEOUT_MS = 5000;

function slugifyProbeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "probe";
}

function toRelOrPosix(baseDir: string, targetPath: string): string {
  return path.relative(baseDir, targetPath).split(path.sep).join("/");
}

/** Resolves a dot-separated field path (with optional numeric array indices) inside parsed JSON. */
export function resolveJsonDotPath(payload: unknown, dotPath: string): unknown {
  if (!dotPath) return undefined;
  const parts = dotPath.split(".");
  let cursor: unknown = payload;
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      if (!/^\d+$/.test(part)) return undefined;
      cursor = cursor[Number(part)];
      continue;
    }
    if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return cursor;
}

/** Loads and validates a `verify` custom HTTP probe config JSON file. */
export function loadProbeConfig(configPath: string, cwd: string): VerifyProbeConfigFile {
  const resolved = path.resolve(cwd, configPath);
  if (!existsSync(resolved)) {
    throw new Error(`Probe config file not found: ${resolved}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolved, "utf-8"));
  } catch (err) {
    throw new Error(`Invalid JSON in probe config "${resolved}": ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Probe config "${resolved}" must be a JSON object.`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.probes) || obj.probes.length === 0) {
    throw new Error(`Probe config "${resolved}" must specify a non-empty "probes" array.`);
  }

  const probes: VerifyProbeDefinition[] = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < obj.probes.length; i += 1) {
    const rawProbe = obj.probes[i];
    if (!rawProbe || typeof rawProbe !== "object" || Array.isArray(rawProbe)) {
      throw new Error(`Probe entry probes[${i}] in "${resolved}" must be an object.`);
    }
    const probe = rawProbe as Record<string, unknown>;
    const name = typeof probe.name === "string" ? probe.name.trim() : "";
    const urlStr = typeof probe.url === "string" ? probe.url.trim() : "";
    if (!name) {
      throw new Error(`Probe entry probes[${i}] in "${resolved}" is missing a valid "name".`);
    }
    if (seenNames.has(name)) {
      throw new Error(`Duplicate probe name "${name}" in "${resolved}".`);
    }
    seenNames.add(name);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      throw new Error(`Probe "${name}" has invalid URL "${urlStr}".`);
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(`Probe "${name}" URL must use http:// or https:// (got "${parsedUrl.protocol}").`);
    }

    let timeoutMs: number | undefined;
    if (probe.timeoutMs !== undefined) {
      if (typeof probe.timeoutMs !== "number" || !Number.isFinite(probe.timeoutMs) || probe.timeoutMs <= 0) {
        throw new Error(`Probe "${name}" timeoutMs must be a positive finite number.`);
      }
      timeoutMs = Math.floor(probe.timeoutMs);
    }

    const assertions: VerifyProbeAssertion[] = [];
    if (probe.assertions !== undefined) {
      if (!Array.isArray(probe.assertions)) {
        throw new Error(`Probe "${name}" assertions must be an array.`);
      }
      for (let j = 0; j < probe.assertions.length; j += 1) {
        const rawAssert = probe.assertions[j];
        if (!rawAssert || typeof rawAssert !== "object" || Array.isArray(rawAssert)) {
          throw new Error(`Probe "${name}" assertions[${j}] must be an object.`);
        }
        const a = rawAssert as Record<string, unknown>;
        const dotPath = typeof a.path === "string" ? a.path.trim() : "";
        const op = typeof a.op === "string" ? a.op : "";
        if (!dotPath) {
          throw new Error(`Probe "${name}" assertions[${j}] requires a non-empty "path".`);
        }
        if (!VALID_PROBE_OPS.has(op as VerifyProbeOp)) {
          throw new Error(`Probe "${name}" assertions[${j}] has unsupported op "${op}".`);
        }
        if (op !== "exists" && a.value === undefined && a.maxRatioOfBaseline === undefined) {
          throw new Error(`Probe "${name}" assertions[${j}] requires "value" or "maxRatioOfBaseline".`);
        }
        if (a.maxRatioOfBaseline !== undefined && (typeof a.maxRatioOfBaseline !== "number" || !Number.isFinite(a.maxRatioOfBaseline) || a.maxRatioOfBaseline <= 0)) {
          throw new Error(`Probe "${name}" assertions[${j}] maxRatioOfBaseline must be a positive number.`);
        }
        if (a.baselineMargin !== undefined && (typeof a.baselineMargin !== "number" || !Number.isFinite(a.baselineMargin) || a.baselineMargin < 0)) {
          throw new Error(`Probe "${name}" assertions[${j}] baselineMargin must be a non-negative number.`);
        }
        assertions.push({
          path: dotPath,
          op: op as VerifyProbeOp,
          ...(a.value !== undefined ? { value: a.value as number | string | boolean } : {}),
          ...(typeof a.maxRatioOfBaseline === "number" ? { maxRatioOfBaseline: a.maxRatioOfBaseline } : {}),
          ...(typeof a.baselineMargin === "number" ? { baselineMargin: a.baselineMargin } : {}),
        });
      }
    }

    probes.push({
      name,
      url: urlStr,
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(assertions.length > 0 ? { assertions } : {}),
    });
  }

  return {
    ...(typeof obj.baselinePath === "string" && obj.baselinePath.trim().length > 0
      ? { baselinePath: obj.baselinePath.trim() }
      : {}),
    ...(typeof obj.updateBaseline === "boolean" ? { updateBaseline: obj.updateBaseline } : {}),
    probes,
  };
}

/** Evaluates configured assertions and baseline ratchets against a single probe payload. */
export function evaluateProbeAssertions(
  payload: unknown,
  assertions: VerifyProbeAssertion[],
  baselineMetrics?: Record<string, number | string | boolean | null>,
): { metrics: Record<string, number | string | boolean | null>; failures: string[] } {
  const metrics: Record<string, number | string | boolean | null> = {};
  const failures: string[] = [];

  for (const assertion of assertions) {
    const actual = resolveJsonDotPath(payload, assertion.path);
    if (
      actual === null ||
      typeof actual === "number" ||
      typeof actual === "string" ||
      typeof actual === "boolean"
    ) {
      metrics[assertion.path] = actual;
    }

    if (assertion.op === "exists") {
      if (actual === undefined || actual === null) {
        failures.push(`${assertion.path}: expected value to exist`);
      }
      continue;
    }

    if (assertion.value !== undefined) {
      if (assertion.op === "eq" && actual !== assertion.value) {
        failures.push(`${assertion.path}: expected === ${JSON.stringify(assertion.value)}, got ${JSON.stringify(actual)}`);
      } else if (assertion.op === "neq" && actual === assertion.value) {
        failures.push(`${assertion.path}: expected !== ${JSON.stringify(assertion.value)}`);
      } else if (assertion.op === "lte" || assertion.op === "lt" || assertion.op === "gte" || assertion.op === "gt") {
        if (typeof actual !== "number" || !Number.isFinite(actual) || typeof assertion.value !== "number") {
          failures.push(`${assertion.path}: expected finite numeric value for "${assertion.op}", got ${JSON.stringify(actual)}`);
        } else {
          const ok =
            assertion.op === "lte"
              ? actual <= assertion.value
              : assertion.op === "lt"
                ? actual < assertion.value
                : assertion.op === "gte"
                  ? actual >= assertion.value
                  : actual > assertion.value;
          if (!ok) {
            failures.push(`${assertion.path}: ${actual} failed ${assertion.op} ${assertion.value}`);
          }
        }
      }
    }

    if (assertion.maxRatioOfBaseline !== undefined && baselineMetrics && assertion.path in baselineMetrics) {
      const baseVal = baselineMetrics[assertion.path];
      if (typeof actual === "number" && Number.isFinite(actual) && typeof baseVal === "number" && Number.isFinite(baseVal)) {
        const margin = assertion.baselineMargin ?? 0;
        const threshold = baseVal * assertion.maxRatioOfBaseline + margin;
        if (actual > threshold) {
          failures.push(
            `${assertion.path}: ${actual} exceeded baseline ratchet (${baseVal} * ${assertion.maxRatioOfBaseline} + ${margin} = ${threshold.toFixed(3)})`,
          );
        }
      }
    }
  }

  return { metrics, failures };
}

export const defaultFetchProbe: FetchProbeFn = async (url, timeoutMs) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const bodyText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      bodyText,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      bodyText: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

export async function executeVerifyProbes(params: {
  config: VerifyProbeConfigFile;
  cwd: string;
  outputDirAbs: string;
  dryRun: boolean;
  updateBaseline?: boolean;
  fetchProbe?: FetchProbeFn;
}): Promise<VerifyProbesSummary> {
  const { config, cwd, outputDirAbs, dryRun } = params;
  const fetchFn = params.fetchProbe ?? defaultFetchProbe;
  const shouldUpdateBaseline = params.updateBaseline ?? config.updateBaseline ?? false;
  const baselineAbsPath = config.baselinePath ? path.resolve(cwd, config.baselinePath) : undefined;
  const baselineRelPath = config.baselinePath ? config.baselinePath : undefined;

  let baselineByProbe: Record<string, Record<string, number | string | boolean | null>> = {};
  if (baselineAbsPath && existsSync(baselineAbsPath)) {
    try {
      const parsedBaseline = JSON.parse(readFileSync(baselineAbsPath, "utf-8")) as {
        probes?: Record<string, Record<string, number | string | boolean | null>>;
      };
      if (parsedBaseline?.probes && typeof parsedBaseline.probes === "object") {
        baselineByProbe = parsedBaseline.probes;
      }
    } catch {
      // Malformed optional baseline falls back to direct assertions.
    }
  }

  if (dryRun) {
    return {
      enabled: true,
      status: "skipped_dry_run",
      total: config.probes.length,
      passed: 0,
      failed: 0,
      ...(baselineRelPath ? { baselinePath: baselineRelPath } : {}),
      entries: config.probes.map((probe) => ({
        name: probe.name,
        url: probe.url,
        status: "skipped_dry_run",
        durationMs: 0,
        metrics: {},
        failures: [],
      })),
    };
  }

  const probesDirAbs = path.join(outputDirAbs, "probes");
  mkdirSync(probesDirAbs, { recursive: true });

  const entries: VerifyProbeResultEntry[] = [];
  const nextBaselineProbes: Record<string, Record<string, number | string | boolean | null>> = {};

  for (const probe of config.probes) {
    const startMs = Date.now();
    const res = await fetchFn(probe.url, probe.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
    const durationMs = Date.now() - startMs;
    const rawAbsPath = path.join(probesDirAbs, `${slugifyProbeName(probe.name)}.json`);
    let parsedBody: unknown;
    let bodyValidJson = false;
    if (res.bodyText) {
      try {
        parsedBody = JSON.parse(res.bodyText);
        bodyValidJson = true;
      } catch {
        parsedBody = undefined;
      }
    }

    if (!res.ok) {
      const errorMsg = res.error
        ? `HTTP probe error: ${res.error}`
        : `HTTP probe returned status ${res.status}`;
      writeFileSync(rawAbsPath, res.bodyText || JSON.stringify({ error: errorMsg }, null, 2), "utf-8");
      entries.push({
        name: probe.name,
        url: probe.url,
        status: "failed",
        ...(res.status > 0 ? { httpStatus: res.status } : {}),
        durationMs,
        rawJsonRelPath: toRelOrPosix(outputDirAbs, rawAbsPath),
        metrics: {},
        failures: [errorMsg],
      });
      continue;
    }

    if (!bodyValidJson) {
      writeFileSync(rawAbsPath, res.bodyText, "utf-8");
      entries.push({
        name: probe.name,
        url: probe.url,
        status: "failed",
        httpStatus: res.status,
        durationMs,
        rawJsonRelPath: toRelOrPosix(outputDirAbs, rawAbsPath),
        metrics: {},
        failures: ["Probe response body is not valid JSON."],
      });
      continue;
    }

    writeFileSync(rawAbsPath, JSON.stringify(parsedBody, null, 2), "utf-8");
    const evaluated = evaluateProbeAssertions(
      parsedBody,
      probe.assertions ?? [],
      baselineByProbe[probe.name],
    );
    nextBaselineProbes[probe.name] = evaluated.metrics;

    entries.push({
      name: probe.name,
      url: probe.url,
      status: evaluated.failures.length === 0 ? "passed" : "failed",
      httpStatus: res.status,
      durationMs,
      rawJsonRelPath: toRelOrPosix(outputDirAbs, rawAbsPath),
      metrics: evaluated.metrics,
      failures: evaluated.failures,
    });
  }

  const passed = entries.filter((e) => e.status === "passed").length;
  const failed = entries.length - passed;
  let baselineUpdated = false;
  if (failed === 0 && shouldUpdateBaseline && baselineAbsPath) {
    mkdirSync(path.dirname(baselineAbsPath), { recursive: true });
    writeFileSync(
      baselineAbsPath,
      JSON.stringify(
        {
          schemaVersion: "e2e-probe-baseline/v1",
          updatedAt: new Date().toISOString(),
          probes: nextBaselineProbes,
        },
        null,
        2,
      ),
      "utf-8",
    );
    baselineUpdated = true;
  }

  return {
    enabled: true,
    status: failed === 0 ? "passed" : "failed",
    total: entries.length,
    passed,
    failed,
    ...(baselineRelPath ? { baselinePath: baselineRelPath } : {}),
    ...(shouldUpdateBaseline ? { baselineUpdated } : {}),
    entries,
  };
}
