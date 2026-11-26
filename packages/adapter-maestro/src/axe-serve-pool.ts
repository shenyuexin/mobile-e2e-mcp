import { type ChildProcess, spawn } from "node:child_process";
import {
  type CommandExecution,
  type CommandExecutionOptions,
  executeRunnerWithTestHooks,
  hasExecuteRunnerTestOverride,
  unrefTimer,
} from "./runtime-shared.js";

const SIMULATOR_UUID_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;

// Route only non-HID read/capture commands through persistent `axe serve`.
// AXe v2.2.0 leaks dtuhidd virtual HID services per HID command inside a
// long-lived `axe serve` worker until process exit (linear latency growth and
// eventual `DTUHID initial guest barrier timed out`). One-shot `axe` releases
// dtuhidd connections on exit, while read/capture commands create 0 HID services.
const AXE_SERVE_SUBCOMMANDS = new Set<string>([
  "describe-ui",
  "displays",
  "screenshot",
  "ping",
]);

export const DEFAULT_AXE_SERVE_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_AXE_SERVE_STARTUP_TIMEOUT_MS = 5_000;
const DEFAULT_AXE_SERVE_COMMAND_TIMEOUT_MS = 15_000;
const DEFAULT_AXE_SERVE_TERM_GRACE_MS = 300;
const DEFAULT_AXE_SERVE_KILL_GRACE_MS = 1_000;
const DEFAULT_AXE_TRANSIENT_RETRY_DELAY_MS = 250;

export interface ParsedAxeServeCommand {
  udid: string;
  subcommand: string;
  args: string[];
  line: string;
}

export interface AxeServeParsedResponse {
  execution?: CommandExecution;
  transportFallback?: boolean;
  evictWorker?: boolean;
  reason?: string;
}

export type AxeServeSpawnFn = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"] },
) => ChildProcess;

export interface AxeServePoolOptions {
  idleTimeoutMs?: number;
  startupTimeoutMs?: number;
  termGraceMs?: number;
  killGraceMs?: number;
  transientRetryDelayMs?: number;
  spawnFn?: AxeServeSpawnFn;
  fallbackRunner?: (
    command: string[],
    repoRoot: string,
    env: NodeJS.ProcessEnv,
    options?: CommandExecutionOptions,
  ) => Promise<CommandExecution>;
}

/**
 * Serialize command tokens into a single line suitable for `axe serve` stdin.
 * Tokens containing whitespace, quotes, backslashes, or empty strings are
 * double-quoted with `\` and `"` escaped.
 */
export function serializeAxeServeLine(tokens: string[]): string {
  return tokens
    .map((token) => {
      if (token.length === 0 || /[\s"'\\]/.test(token)) {
        const escaped = token.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
        return `"${escaped}"`;
      }
      return token;
    })
    .join(" ");
}

/**
 * Parse a one-shot `axe ... --udid <UUID>` command into a `axe serve` request.
 * Returns `null` when the command is not eligible for persistent `axe serve`
 * (e.g., non-AXe command, unsupported subcommand, physical device UDID,
 * missing UDID, or control/newline characters in arguments).
 */
export function parseAxeServeCommand(command: string[]): ParsedAxeServeCommand | null {
  if (command.length < 2 || command[0] !== "axe") {
    return null;
  }
  const subcommand = command[1];
  if (!AXE_SERVE_SUBCOMMANDS.has(subcommand)) {
    return null;
  }

  let udid: string | undefined;
  const remainingArgs: string[] = [];

  for (let i = 2; i < command.length; i += 1) {
    const token = command[i];
    if (token === "--udid") {
      if (udid !== undefined || i + 1 >= command.length) {
        return null;
      }
      udid = command[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith("--udid=")) {
      if (udid !== undefined) {
        return null;
      }
      udid = token.slice("--udid=".length);
      continue;
    }
    if (/[\r\n\0]/.test(token)) {
      return null;
    }
    remainingArgs.push(token);
  }

  if (!udid || !SIMULATOR_UUID_PATTERN.test(udid)) {
    return null;
  }

  const tokens = [subcommand, ...remainingArgs];
  return {
    udid,
    subcommand,
    args: remainingArgs,
    line: serializeAxeServeLine(tokens),
  };
}

export function isAxeServeDisabledByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.M2E_DISABLE_AXE_SERVE?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function isTransientAxeTransportError(message: string): boolean {
  return (
    /dtuhid initial guest barrier timed out/i.test(message) ||
    /no translation object returned for simulator/i.test(message) ||
    /another axe command is using the simulator/i.test(message)
  );
}

/**
 * Parse one JSON line returned by `axe serve` stdout into a CommandExecution
 * matching one-shot `axe` CLI semantics (`describe-ui` emits raw JSON result
 * array/object for `parseIosInspectNodes`).
 */
export function parseAxeServeResponse(rawLine: string): AxeServeParsedResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawLine);
  } catch {
    return {
      transportFallback: true,
      reason: `axe serve returned non-JSON line: ${rawLine.slice(0, 120)}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      transportFallback: true,
      reason: "axe serve returned non-object JSON payload",
    };
  }

  const record = parsed as {
    command?: unknown;
    didError?: unknown;
    data?: { result?: unknown };
    error?: { code?: unknown; message?: unknown };
  };

  if (record.didError === true) {
    const code = typeof record.error?.code === "string" ? record.error.code : "";
    const message =
      typeof record.error?.message === "string"
        ? record.error.message
        : JSON.stringify(record.error ?? record);
    if (isTransientAxeTransportError(message)) {
      return {
        transportFallback: true,
        evictWorker: true,
        reason: message,
      };
    }
    if (code === "unknownCommand" || message.includes("is not one of them")) {
      return {
        transportFallback: true,
        reason: message,
      };
    }
    return {
      execution: {
        exitCode: 1,
        stdout: "",
        stderr: message,
      },
    };
  }

  if (record.didError !== false) {
    return {
      transportFallback: true,
      reason: "axe serve response missing boolean didError field",
    };
  }

  const resultPayload = record.data?.result;
  if (record.command === "describe-ui") {
    if (resultPayload === undefined) {
      return {
        transportFallback: true,
        reason: "axe serve describe-ui response missing data.result",
      };
    }
    return {
      execution: {
        exitCode: 0,
        stdout: JSON.stringify(resultPayload),
        stderr: "",
      },
    };
  }

  return {
    execution: {
      exitCode: 0,
      stdout: resultPayload !== undefined ? JSON.stringify(resultPayload) : rawLine,
      stderr: "",
    },
  };
}

function unrefStream(stream: unknown): void {
  if (typeof stream === "object" && stream !== null && "unref" in stream && typeof (stream as { unref?: unknown }).unref === "function") {
    (stream as { unref: () => void }).unref();
  }
}

function refStream(stream: unknown): void {
  if (typeof stream === "object" && stream !== null && "ref" in stream && typeof (stream as { ref?: unknown }).ref === "function") {
    (stream as { ref: () => void }).ref();
  }
}

function unrefChildHandles(child: ChildProcess): void {
  child.unref();
  unrefStream(child.stdin);
  unrefStream(child.stdout);
  unrefStream(child.stderr);
}

function refChildHandles(child: ChildProcess): void {
  child.ref();
  refStream(child.stdin);
  refStream(child.stdout);
  refStream(child.stderr);
}

interface LineWaiter {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
}

class AxeServeWorker {
  readonly udid: string;
  private readonly child: ChildProcess;
  private readonly idleTimeoutMs: number;
  private readonly termGraceMs: number;
  private readonly killGraceMs: number;
  private readonly onEvict: () => void;
  private readonly onChildExit?: () => void;
  private readonly bufferedLines: string[] = [];
  private currentWaiter: LineWaiter | null = null;
  private stdoutBuffer = "";
  private stderrTail = "";
  private closed = false;
  private childExited = false;
  private inFlight = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private termTimer: ReturnType<typeof setTimeout> | undefined;
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  private serialChain: Promise<void> = Promise.resolve();
  readonly readyPromise: Promise<void>;

  constructor(params: {
    udid: string;
    repoRoot: string;
    env: NodeJS.ProcessEnv;
    idleTimeoutMs: number;
    startupTimeoutMs: number;
    termGraceMs: number;
    killGraceMs: number;
    spawnFn: AxeServeSpawnFn;
    onEvict: () => void;
    onChildExit?: () => void;
  }) {
    this.udid = params.udid;
    this.idleTimeoutMs = params.idleTimeoutMs;
    this.termGraceMs = params.termGraceMs;
    this.killGraceMs = params.killGraceMs;
    this.onEvict = params.onEvict;
    this.onChildExit = params.onChildExit;

    this.child = params.spawnFn("axe", ["serve", "--udid", params.udid], {
      cwd: params.repoRoot,
      env: params.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string | Buffer) => {
      this.stdoutBuffer += chunk.toString();
      while (true) {
        const newlineIdx = this.stdoutBuffer.indexOf("\n");
        if (newlineIdx === -1) {
          break;
        }
        const line = this.stdoutBuffer.slice(0, newlineIdx).replace(/\r$/, "").trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIdx + 1);
        if (!line) {
          continue;
        }
        if (this.currentWaiter) {
          const waiter = this.currentWaiter;
          this.currentWaiter = null;
          waiter.resolve(line);
        } else {
          this.bufferedLines.push(line);
        }
      }
    });

    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string | Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000);
    });

    this.child.once("exit", () => {
      this.markChildExited();
    });

    this.child.on("error", (error) => {
      this.markChildExited();
      this.terminate(new Error(`axe serve spawn error: ${error.message}`));
    });

    this.child.on("close", (code, signal) => {
      this.markChildExited();
      const detail = this.stderrTail.trim();
      const suffix = detail ? `: ${detail}` : "";
      this.terminate(
        new Error(
          `axe serve exited unexpectedly (code=${String(code)}, signal=${String(signal)})${suffix}`,
        ),
      );
    });

    this.readyPromise = this.awaitReadyLine(params.startupTimeoutMs);
    this.readyPromise.catch(() => {});
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get hasChildExited(): boolean {
    return this.childExited || this.child.exitCode !== null || this.child.signalCode !== null;
  }

  private clearEscalationTimers(): void {
    if (this.termTimer !== undefined) {
      clearTimeout(this.termTimer);
      this.termTimer = undefined;
    }
    if (this.killTimer !== undefined) {
      clearTimeout(this.killTimer);
      this.killTimer = undefined;
    }
  }

  private markChildExited(): void {
    this.clearEscalationTimers();
    if (this.childExited) {
      return;
    }
    this.childExited = true;
    this.onChildExit?.();
  }

  get recentStderr(): string {
    return this.stderrTail;
  }

  private async awaitReadyLine(startupTimeoutMs: number): Promise<void> {
    this.inFlight += 1;
    refChildHandles(this.child);
    try {
      const readyLine = await this.readNextLine(startupTimeoutMs, "axe serve startup");
      let parsed: unknown;
      try {
        parsed = JSON.parse(readyLine);
      } catch {
        throw new Error(`axe serve emitted invalid ready line: ${readyLine.slice(0, 120)}`);
      }
      const record = parsed as {
        command?: unknown;
        didError?: unknown;
        data?: { result?: { ready?: unknown } };
        error?: { message?: unknown };
      };
      if (record.didError === true || record.data?.result?.ready !== true) {
        const msg =
          typeof record.error?.message === "string"
            ? record.error.message
            : readyLine.slice(0, 160);
        throw new Error(`axe serve failed readiness handshake: ${msg}`);
      }
    } catch (error) {
      this.close();
      throw error;
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      if (!this.closed && this.inFlight === 0) {
        this.scheduleIdleShutdown();
      }
    }
  }

  private readNextLine(timeoutMs: number, label: string): Promise<string> {
    if (this.bufferedLines.length > 0) {
      return Promise.resolve(this.bufferedLines.shift()!);
    }
    if (this.closed) {
      return Promise.reject(new Error(`${label}: axe serve worker is closed`));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.currentWaiter) {
          this.currentWaiter = null;
        }
        const timeoutErr = new Error(`${label} timed out after ${String(timeoutMs)}ms`);
        this.terminate(timeoutErr);
        reject(timeoutErr);
      }, timeoutMs);
      unrefTimer(timer);

      this.currentWaiter = {
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
    });
  }

  private clearIdleShutdown(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleShutdown();
    if (this.closed) {
      return;
    }
    unrefChildHandles(this.child);
    this.idleTimer = setTimeout(() => {
      this.close();
    }, this.idleTimeoutMs);
    unrefTimer(this.idleTimer);
  }

  async sendCommand(line: string, timeoutMs: number): Promise<string> {
    await this.readyPromise;
    let release!: () => void;
    const prev = this.serialChain;
    this.serialChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;

    this.clearIdleShutdown();
    this.inFlight += 1;
    refChildHandles(this.child);

    try {
      if (this.closed || !this.child.stdin || this.child.stdin.destroyed) {
        throw new Error("axe serve worker stdin unavailable");
      }
      await new Promise<void>((resolve, reject) => {
        this.child.stdin!.write(`${line}\n`, "utf8", (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      return await this.readNextLine(timeoutMs, `axe serve command`);
    } catch (error) {
      this.close();
      throw error;
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      release();
      if (!this.closed && this.inFlight === 0) {
        this.scheduleIdleShutdown();
      }
    }
  }

  private terminate(reason: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.clearIdleShutdown();
    this.onEvict();
    if (this.currentWaiter) {
      const waiter = this.currentWaiter;
      this.currentWaiter = null;
      waiter.reject(reason);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.terminate(new Error("axe serve worker closed"));
    unrefChildHandles(this.child);
    try {
      this.child.stdout?.destroy();
    } catch {
      // ignore
    }
    try {
      this.child.stderr?.destroy();
    } catch {
      // ignore
    }
    try {
      this.child.stdin?.end();
    } catch {
      // ignore
    }
    if (this.hasChildExited) {
      this.markChildExited();
      return;
    }
    // Schedule SIGTERM then SIGKILL on unref'd timers using exitCode/signalCode
    // rather than child.killed (which Node sets true immediately on SIGTERM).
    this.clearEscalationTimers();
    this.termTimer = setTimeout(() => {
      this.termTimer = undefined;
      try {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill("SIGTERM");
        }
      } catch {
        // ignore
      }
    }, this.termGraceMs);
    unrefTimer(this.termTimer);

    this.killTimer = setTimeout(() => {
      this.killTimer = undefined;
      try {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill("SIGKILL");
        }
      } catch {
        // ignore
      }
    }, this.killGraceMs);
    unrefTimer(this.killTimer);
  }

  forceKillSync(): void {
    this.closed = true;
    this.clearIdleShutdown();
    this.clearEscalationTimers();
    try {
      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill("SIGKILL");
      }
    } catch {
      // ignore
    }
  }
}

export class AxeServePool {
  private readonly workers = new Map<string, AxeServeWorker>();
  private readonly closingWorkers = new Set<AxeServeWorker>();
  private readonly idleTimeoutMs: number;
  private readonly startupTimeoutMs: number;
  private readonly termGraceMs: number;
  private readonly killGraceMs: number;
  private readonly transientRetryDelayMs: number;
  private readonly spawnFn: AxeServeSpawnFn;
  private readonly fallbackRunner: (
    command: string[],
    repoRoot: string,
    env: NodeJS.ProcessEnv,
    options?: CommandExecutionOptions,
  ) => Promise<CommandExecution>;
  private serveUnsupported = false;

  constructor(options: AxeServePoolOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_AXE_SERVE_IDLE_TIMEOUT_MS;
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_AXE_SERVE_STARTUP_TIMEOUT_MS;
    this.termGraceMs = options.termGraceMs ?? DEFAULT_AXE_SERVE_TERM_GRACE_MS;
    this.killGraceMs = options.killGraceMs ?? DEFAULT_AXE_SERVE_KILL_GRACE_MS;
    this.transientRetryDelayMs =
      options.transientRetryDelayMs ?? DEFAULT_AXE_TRANSIENT_RETRY_DELAY_MS;
    this.spawnFn =
      options.spawnFn ??
      ((cmd, args, spawnOpts) => spawn(cmd, args, spawnOpts));
    this.fallbackRunner = options.fallbackRunner ?? executeRunnerWithTestHooks;
  }

  get activeWorkerCount(): number {
    return this.workers.size;
  }

  get closingWorkerCount(): number {
    return this.closingWorkers.size;
  }

  hasWorker(deviceId: string): boolean {
    const worker = this.workers.get(deviceId);
    return Boolean(worker && !worker.isClosed);
  }

  private getOrCreateWorker(udid: string, repoRoot: string, env: NodeJS.ProcessEnv): AxeServeWorker {
    const existing = this.workers.get(udid);
    if (existing && !existing.isClosed) {
      return existing;
    }
    const worker = new AxeServeWorker({
      udid,
      repoRoot,
      env,
      idleTimeoutMs: this.idleTimeoutMs,
      startupTimeoutMs: this.startupTimeoutMs,
      termGraceMs: this.termGraceMs,
      killGraceMs: this.killGraceMs,
      spawnFn: this.spawnFn,
      onEvict: () => {
        if (this.workers.get(udid) === worker) {
          this.workers.delete(udid);
        }
        if (!worker.hasChildExited) {
          this.closingWorkers.add(worker);
        }
      },
      onChildExit: () => {
        this.closingWorkers.delete(worker);
      },
    });
    this.workers.set(udid, worker);
    return worker;
  }

  async execute(
    command: string[],
    repoRoot: string,
    env: NodeJS.ProcessEnv = process.env,
    options: CommandExecutionOptions = {},
  ): Promise<CommandExecution> {
    if (
      hasExecuteRunnerTestOverride() ||
      this.serveUnsupported ||
      isAxeServeDisabledByEnv(env)
    ) {
      return this.fallbackRunner(command, repoRoot, env, options);
    }

    const parsed = parseAxeServeCommand(command);
    if (!parsed) {
      let fallbackResult = await this.fallbackRunner(command, repoRoot, env, options);
      if (
        command[0] === "axe" &&
        fallbackResult.exitCode !== 0 &&
        isTransientAxeTransportError(fallbackResult.stderr)
      ) {
        if (this.transientRetryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.transientRetryDelayMs * 2));
        }
        fallbackResult = await this.fallbackRunner(command, repoRoot, env, options);
      }
      return fallbackResult;
    }

    const timeoutMs = Math.min(
      options.timeoutMs ?? DEFAULT_AXE_SERVE_COMMAND_TIMEOUT_MS,
      DEFAULT_AXE_SERVE_COMMAND_TIMEOUT_MS,
    );
    const worker = this.getOrCreateWorker(parsed.udid, repoRoot, env);

    try {
      const responseLine = await worker.sendCommand(parsed.line, timeoutMs);
      const outcome = parseAxeServeResponse(responseLine);
      if (outcome.execution) {
        return outcome.execution;
      }
      if (outcome.evictWorker) {
        worker.close();
        if (this.transientRetryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.transientRetryDelayMs));
        }
      }
      // Transient transport error, unsupported subcommand, or malformed response: fall back cleanly.
      let fallbackResult = await this.fallbackRunner(command, repoRoot, env, options);
      if (
        outcome.evictWorker &&
        fallbackResult.exitCode !== 0 &&
        isTransientAxeTransportError(fallbackResult.stderr)
      ) {
        if (this.transientRetryDelayMs > 0) {
          await new Promise((r) => setTimeout(r, this.transientRetryDelayMs * 2));
        }
        fallbackResult = await this.fallbackRunner(command, repoRoot, env, options);
      }
      return fallbackResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = `${message} ${worker.recentStderr}`.toLowerCase();
      if (
        lower.includes("enoent") ||
        lower.includes("unknown command") ||
        lower.includes("unexpected argument 'serve'") ||
        lower.includes("unrecognized command")
      ) {
        this.serveUnsupported = true;
      }
      worker.close();
      return this.fallbackRunner(command, repoRoot, env, options);
    }
  }

  closeDevice(deviceId: string): void {
    const worker = this.workers.get(deviceId);
    if (worker) {
      this.workers.delete(deviceId);
      if (!worker.hasChildExited) {
        this.closingWorkers.add(worker);
      }
      worker.close();
    }
  }

  closeAll(): void {
    const all = [...this.workers.values()];
    this.workers.clear();
    for (const worker of all) {
      if (!worker.hasChildExited) {
        this.closingWorkers.add(worker);
      }
      worker.close();
    }
  }

  forceKillAllSync(): void {
    const all = new Set<AxeServeWorker>([
      ...this.workers.values(),
      ...this.closingWorkers.values(),
    ]);
    this.workers.clear();
    this.closingWorkers.clear();
    for (const worker of all) {
      worker.forceKillSync();
    }
  }
}

const defaultAxeServePool = new AxeServePool();

process.once("exit", () => {
  defaultAxeServePool.forceKillAllSync();
});

export async function executeAxeCommandWithPool(
  command: string[],
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  options: CommandExecutionOptions = {},
): Promise<CommandExecution> {
  return defaultAxeServePool.execute(command, repoRoot, env, options);
}

export function closeAxeServeForDevice(deviceId: string): void {
  defaultAxeServePool.closeDevice(deviceId);
}

export function closeAllAxeServeSessions(): void {
  defaultAxeServePool.closeAll();
}

export function forceKillAllAxeServeSessionsSync(): void {
  defaultAxeServePool.forceKillAllSync();
}
