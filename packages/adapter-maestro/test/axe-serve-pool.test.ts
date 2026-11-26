import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import {
  AxeServePool,
  parseAxeServeCommand,
  parseAxeServeResponse,
  serializeAxeServeLine,
} from "../src/axe-serve-pool.js";
import {
  resetExecuteRunnerForTesting,
  setExecuteRunnerForTesting,
} from "../src/runtime-shared.js";

const SIM_UDID = "70D29C87-AE8C-4B0E-82AB-83F442AA5151";
const PHYSICAL_UDID = "00008101-000D482C1E78001E";

function createFakeAxeServeChild(
  handler: (line: string, respond: (json: unknown) => void, child: EventEmitter) => void,
  options: { emitReady?: boolean; readyPayload?: unknown; exitImmediatelyCode?: number; stderrOnExit?: string; ignoreSignalsExceptKill?: boolean } = {},
): ChildProcess & { killedSignals: string[]; stdinLines: string[] } {
  const emitter = new EventEmitter() as ChildProcess & {
    killedSignals: string[];
    stdinLines: string[];
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    killed: boolean;
  };
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  emitter.stdin = stdin;
  emitter.stdout = stdout;
  emitter.stderr = stderr;
  emitter.exitCode = null;
  emitter.signalCode = null;
  emitter.killed = false;
  emitter.killedSignals = [];
  emitter.stdinLines = [];
  emitter.ref = () => emitter;
  emitter.unref = () => emitter;
  emitter.kill = ((signal?: NodeJS.Signals | number) => {
    const sig = String(signal ?? "SIGTERM");
    emitter.killed = true;
    emitter.killedSignals.push(sig);
    if (options.ignoreSignalsExceptKill && sig !== "SIGKILL") {
      return true;
    }
    emitter.signalCode = typeof signal === "string" ? signal : "SIGTERM";
    emitter.exitCode = 0;
    queueMicrotask(() => emitter.emit("close", 0, emitter.signalCode));
    return true;
  }) as ChildProcess["kill"];

  const respond = (payload: unknown) => {
    stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload)}\n`);
  };

  let buf = "";
  stdin.on("data", (chunk: Buffer | string) => {
    buf += chunk.toString();
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx === -1) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      emitter.stdinLines.push(line);
      handler(line, respond, emitter);
    }
  });

  if (options.exitImmediatelyCode !== undefined) {
    queueMicrotask(() => {
      if (options.stderrOnExit) stderr.write(options.stderrOnExit);
      emitter.exitCode = options.exitImmediatelyCode!;
      emitter.emit("close", options.exitImmediatelyCode, null);
    });
  } else if (options.emitReady !== false) {
    queueMicrotask(() => {
      respond(
        options.readyPayload ?? {
          command: "serve",
          didError: false,
          data: { result: { ready: true, udid: SIM_UDID } },
        },
      );
    });
  }

  return emitter;
}

test("parseAxeServeCommand accepts eligible simulator read/capture commands and strips --udid", () => {
  const desc = parseAxeServeCommand(["axe", "describe-ui", "--udid", SIM_UDID]);
  assert.deepEqual(desc, {
    udid: SIM_UDID,
    subcommand: "describe-ui",
    args: [],
    line: "describe-ui",
  });

  const pt = parseAxeServeCommand(["axe", "describe-ui", "--udid", SIM_UDID, "--point", "120,340"]);
  assert.equal(pt?.line, "describe-ui --point 120,340");

  const disp = parseAxeServeCommand(["axe", "displays", "--udid", SIM_UDID]);
  assert.equal(disp?.line, "displays");

  const shot = parseAxeServeCommand(["axe", "screenshot", "--output", '/tmp/a "b" \\ c.png', `--udid=${SIM_UDID}`]);
  assert.equal(shot?.line, 'screenshot --output "/tmp/a \\"b\\" \\\\ c.png"');

  const png = parseAxeServeCommand(["axe", "ping", "--udid", SIM_UDID]);
  assert.equal(png?.line, "ping");

  assert.equal(serializeAxeServeLine(["type", ""]), 'type ""');
});

test("parseAxeServeCommand rejects ineligible and HID input commands", () => {
  assert.equal(parseAxeServeCommand(["xcrun", "simctl", "list"]), null);
  assert.equal(parseAxeServeCommand(["axe", "--version"]), null);
  assert.equal(parseAxeServeCommand(["axe", "record-video", "--udid", SIM_UDID]), null);
  assert.equal(parseAxeServeCommand(["axe", "describe-ui", "--udid", PHYSICAL_UDID]), null);
  assert.equal(parseAxeServeCommand(["axe", "describe-ui"]), null);
  assert.equal(parseAxeServeCommand(["axe", "describe-ui", "--help\nextra", "--udid", SIM_UDID]), null);
  assert.equal(parseAxeServeCommand(["axe", "tap", "-x", "10", "-y", "20", "--udid", SIM_UDID]), null);
  assert.equal(parseAxeServeCommand(["axe", "gesture", "pinch", "--udid", SIM_UDID]), null);
  assert.equal(parseAxeServeCommand(["axe", "type", "hello", "--udid", SIM_UDID]), null);
});

test("parseAxeServeResponse unwraps describe-ui, maps runtime errors, and flags protocol fallback", () => {
  const okDescribe = parseAxeServeResponse(
    JSON.stringify({ command: "describe-ui", didError: false, data: { result: [{ type: "Application" }] } }),
  );
  assert.equal(okDescribe.execution?.exitCode, 0);
  assert.equal(okDescribe.execution?.stdout, '[{"type":"Application"}]');

  const runtimeErr = parseAxeServeResponse(
    JSON.stringify({
      command: "tap",
      didError: true,
      error: { code: "invalidArguments", message: "missing coordinates" },
    }),
  );
  assert.equal(runtimeErr.execution?.exitCode, 1);
  assert.equal(runtimeErr.execution?.stderr, "missing coordinates");

  const unknownCmd = parseAxeServeResponse(
    JSON.stringify({
      command: "weird",
      didError: true,
      error: { code: "unknownCommand", message: "not supported" },
    }),
  );
  assert.equal(unknownCmd.transportFallback, true);
  assert.equal(parseAxeServeResponse("not-json").transportFallback, true);
});

test("AxeServePool reuses a single worker across read/capture commands and serializes concurrent calls", async () => {
  let spawnCount = 0;
  const pool = new AxeServePool({
    idleTimeoutMs: 5_000,
    spawnFn: () => {
      spawnCount += 1;
      return createFakeAxeServeChild((line, respond) => {
        if (line === "describe-ui") {
          setTimeout(() => {
            respond({ command: "describe-ui", didError: false, data: { result: [{ AXLabel: "Root" }] } });
          }, 15);
        } else if (line.startsWith("displays")) {
          respond({ command: "displays", didError: false, data: { result: { echoed: line } } });
        } else {
          respond({ command: "screenshot", didError: false, data: { result: { echoed: line } } });
        }
      });
    },
    fallbackRunner: async () => {
      throw new Error("fallback should not be called");
    },
  });

  try {
    const [r1, r2, r3] = await Promise.all([
      pool.execute(["axe", "describe-ui", "--udid", SIM_UDID], process.cwd(), {}),
      pool.execute(["axe", "displays", "--udid", SIM_UDID], process.cwd(), {}),
      pool.execute(["axe", "screenshot", "--output", "/tmp/shot.png", "--udid", SIM_UDID], process.cwd(), {}),
    ]);
    assert.equal(spawnCount, 1);
    assert.equal(pool.activeWorkerCount, 1);
    assert.equal(r1.exitCode, 0);
    assert.equal(r1.stdout, '[{"AXLabel":"Root"}]');
    assert.equal(r2.exitCode, 0);
    assert.match(r2.stdout, /displays/);
    assert.equal(r3.exitCode, 0);
    assert.match(r3.stdout, /screenshot --output \/tmp\/shot\.png/);
  } finally {
    pool.closeAll();
  }
  assert.equal(pool.activeWorkerCount, 0);
});

test("AxeServePool respects M2E_DISABLE_AXE_SERVE and _testExecuteRunner override", async () => {
  let spawnCount = 0;
  let fallbackCalls = 0;
  const pool = new AxeServePool({
    spawnFn: () => {
      spawnCount += 1;
      return createFakeAxeServeChild(() => {});
    },
    fallbackRunner: async () => {
      fallbackCalls += 1;
      return { exitCode: 0, stdout: "fallback-ok", stderr: "" };
    },
  });

  const envDisabled = await pool.execute(
    ["axe", "describe-ui", "--udid", SIM_UDID],
    process.cwd(),
    { M2E_DISABLE_AXE_SERVE: "1" },
  );
  assert.equal(spawnCount, 0);
  assert.equal(fallbackCalls, 1);
  assert.equal(envDisabled.stdout, "fallback-ok");

  setExecuteRunnerForTesting(async () => ({ exitCode: 0, stdout: "hook-ok", stderr: "" }));
  try {
    const hookedPool = new AxeServePool({
      spawnFn: () => {
        spawnCount += 1;
        return createFakeAxeServeChild(() => {});
      },
    });
    const hooked = await hookedPool.execute(["axe", "describe-ui", "--udid", SIM_UDID], process.cwd(), {});
    assert.equal(spawnCount, 0);
    assert.equal(hooked.stdout, "hook-ok");
  } finally {
    resetExecuteRunnerForTesting();
  }
});

test("AxeServePool transparently falls back on unsupported axe serve and evicts idle workers", async () => {
  let unsupportedSpawns = 0;
  let fallbackCount = 0;
  const unsupportedPool = new AxeServePool({
    spawnFn: () => {
      unsupportedSpawns += 1;
      return createFakeAxeServeChild(() => {}, {
        exitImmediatelyCode: 64,
        stderrOnExit: "Error: Unexpected argument 'serve'\n",
      });
    },
    fallbackRunner: async () => {
      fallbackCount += 1;
      return { exitCode: 0, stdout: "oneshot-ok", stderr: "" };
    },
  });

  const first = await unsupportedPool.execute(["axe", "describe-ui", "--udid", SIM_UDID], process.cwd(), {});
  const second = await unsupportedPool.execute(["axe", "describe-ui", "--udid", SIM_UDID], process.cwd(), {});
  assert.equal(first.stdout, "oneshot-ok");
  assert.equal(second.stdout, "oneshot-ok");
  assert.equal(unsupportedSpawns, 1, "should latch serveUnsupported after first unknown-serve error");
  assert.equal(fallbackCount, 2);

  const idlePool = new AxeServePool({
    idleTimeoutMs: 40,
    spawnFn: () =>
      createFakeAxeServeChild((_line, respond) => {
        respond({ command: "ping", didError: false, data: { result: { pong: true } } });
      }),
  });
  await idlePool.execute(["axe", "ping", "--udid", SIM_UDID], process.cwd(), {});
  assert.equal(idlePool.hasWorker(SIM_UDID), true);
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(idlePool.hasWorker(SIM_UDID), false);
});

test("AxeServePool close escalates SIGTERM -> SIGKILL even when child ignores SIGTERM (child.killed === true)", async () => {
  let fakeChild: (ChildProcess & { killedSignals: string[]; stdinLines: string[] }) | undefined;
  const pool = new AxeServePool({
    termGraceMs: 25,
    killGraceMs: 60,
    spawnFn: () => {
      fakeChild = createFakeAxeServeChild(
        (_line, respond) => {
          respond({ command: "ping", didError: false, data: { result: { pong: true } } });
        },
        { ignoreSignalsExceptKill: true },
      );
      return fakeChild;
    },
  });

  await pool.execute(["axe", "ping", "--udid", SIM_UDID], process.cwd(), {});
  pool.closeDevice(SIM_UDID);
  assert.equal(pool.hasWorker(SIM_UDID), false);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(fakeChild?.killedSignals, ["SIGTERM", "SIGKILL"]);
});

test("AxeServePool evicts worker on transient serve error and retries one-shot HID fallback once on transient DTUHID error", async () => {
  let serveFallbackCalls = 0;
  const servePool = new AxeServePool({
    transientRetryDelayMs: 5,
    spawnFn: () =>
      createFakeAxeServeChild((_line, respond) => {
        respond({
          command: "describe-ui",
          didError: true,
          error: { code: "describeFailed", message: "No translation object returned for simulator" },
        });
      }),
    fallbackRunner: async () => {
      serveFallbackCalls += 1;
      if (serveFallbackCalls === 1) {
        return { exitCode: 1, stdout: "", stderr: "No translation object returned for simulator" };
      }
      return { exitCode: 0, stdout: '[{"AXLabel":"Recovered"}]', stderr: "" };
    },
  });

  const serveResult = await servePool.execute(["axe", "describe-ui", "--udid", SIM_UDID], process.cwd(), {});
  assert.equal(serveResult.exitCode, 0);
  assert.equal(serveResult.stdout, '[{"AXLabel":"Recovered"}]');
  assert.equal(serveFallbackCalls, 2);
  assert.equal(servePool.hasWorker(SIM_UDID), false);

  let hidSpawnCount = 0;
  let hidFallbackCalls = 0;
  const hidPool = new AxeServePool({
    transientRetryDelayMs: 5,
    spawnFn: () => {
      hidSpawnCount += 1;
      return createFakeAxeServeChild(() => {});
    },
    fallbackRunner: async () => {
      hidFallbackCalls += 1;
      if (hidFallbackCalls === 1) {
        return { exitCode: 1, stdout: "", stderr: "Error: DTUHID initial guest barrier timed out" };
      }
      return { exitCode: 0, stdout: "Tap succeeded", stderr: "" };
    },
  });

  const hidResult = await hidPool.execute(["axe", "tap", "-x", "100", "-y", "200", "--udid", SIM_UDID], process.cwd(), {});
  assert.equal(hidResult.exitCode, 0);
  assert.equal(hidResult.stdout, "Tap succeeded");
  assert.equal(hidSpawnCount, 0);
  assert.equal(hidFallbackCalls, 2);
});
