import type {
  DeviceDisplayMetadata,
  DeviceDisplayScreen,
  DeviceInfo,
  DoctorCheck,
} from "@mobile-e2e-mcp/contracts";
import { CLI_COMMANDS } from "./constants/cli-commands.js";
import { executeRunnerWithTestHooks as executeRunner } from "./runtime-shared.js";

const DEFAULT_ENV_PROBE_TIMEOUT_MS = 3000;
const DEFAULT_DISPLAYS_PROBE_TIMEOUT_MS = 2500;
const IOS_SIMULATOR_UDID_PATTERN = /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/i;

export function isIosSimulatorUdid(deviceId: string): boolean {
  return IOS_SIMULATOR_UDID_PATTERN.test(deviceId);
}

export interface IosSimulatorEnvDeps {
  execute?: typeof executeRunner;
}

export function parseAppleKeyboardsOutput(stdout: string): string[] {
  const keyboards: string[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === "(" || trimmed === ")" || trimmed === ");") {
      continue;
    }
    const withoutComma = trimmed.endsWith(",") ? trimmed.slice(0, -1).trim() : trimmed;
    const unquoted =
      (withoutComma.startsWith('"') && withoutComma.endsWith('"')) ||
      (withoutComma.startsWith("'") && withoutComma.endsWith("'"))
        ? withoutComma.slice(1, -1)
        : withoutComma;
    if (unquoted.length > 0) {
      keyboards.push(unquoted);
    }
  }
  return keyboards;
}

export function isNonLatinImeKeyboard(keyboardId: string): boolean {
  const normalized = keyboardId.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    normalized.startsWith("zh_") ||
    normalized.startsWith("zh-") ||
    normalized.startsWith("ja_") ||
    normalized.startsWith("ja-") ||
    normalized.startsWith("ko_") ||
    normalized.startsWith("ko-")
  ) {
    return true;
  }
  return /pinyin|wubi|shuangpin|cangjie|sucheng|zhuyin|handwriting|kana|romaji|hangul/i.test(
    normalized,
  );
}

export async function collectIosKeyboardDoctorChecks(
  repoRoot: string,
  iosDevices: DeviceInfo[],
  deps: IosSimulatorEnvDeps = {},
): Promise<DoctorCheck[]> {
  const run = deps.execute ?? executeRunner;
  const bootedSimulators = iosDevices.filter(
    (device) =>
      device.available &&
      device.state.toLowerCase() === "booted" &&
      isIosSimulatorUdid(device.id),
  );
  if (bootedSimulators.length === 0) {
    return [];
  }

  const checks: DoctorCheck[] = [];
  for (const sim of bootedSimulators) {
    try {
      const execResult = await run(
        [
          CLI_COMMANDS.xcrun,
          "simctl",
          "spawn",
          sim.id,
          "defaults",
          "read",
          "-g",
          "AppleKeyboards",
        ],
        repoRoot,
        process.env,
        { timeoutMs: DEFAULT_ENV_PROBE_TIMEOUT_MS },
      );
      if (execResult.exitCode !== 0) {
        continue;
      }
      const keyboards = parseAppleKeyboardsOutput(execResult.stdout);
      if (keyboards.length === 0) {
        continue;
      }
      const primary = keyboards[0];
      const label = sim.name ? `${sim.name} (${sim.id})` : sim.id;
      if (isNonLatinImeKeyboard(primary)) {
        checks.push({
          name: `ios simulator keyboard ${label}`,
          status: "warn",
          detail: `Primary keyboard is '${primary}' (non-Latin/CJK IME), which can corrupt 'axe type' ASCII input with candidate spaces (\\u2006). Move 'en_US@sw=QWERTY;hw=Automatic' to index 0.`,
        });
      } else {
        checks.push({
          name: `ios simulator keyboard ${label}`,
          status: "pass",
          detail: `Primary keyboard is '${primary}'.`,
        });
      }
    } catch {
      // Ignore transient spawn errors during doctor checks.
    }
  }
  return checks;
}

function toDisplayScreen(raw: unknown): DeviceDisplayScreen | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const width = typeof obj.width === "number" && Number.isFinite(obj.width) ? obj.width : undefined;
  const height = typeof obj.height === "number" && Number.isFinite(obj.height) ? obj.height : undefined;
  if (width === undefined || height === undefined) {
    return undefined;
  }
  return {
    ...(typeof obj.id === "number" && Number.isFinite(obj.id) ? { id: obj.id } : {}),
    ...(typeof obj.uuid === "string" && obj.uuid.length > 0 ? { uuid: obj.uuid } : {}),
    ...(typeof obj.role === "string" && obj.role.length > 0 ? { role: obj.role } : {}),
    width,
    height,
    ...(typeof obj.scale === "number" && Number.isFinite(obj.scale) ? { scale: obj.scale } : {}),
    ...(typeof obj.orientation === "string" && obj.orientation.length > 0 ? { orientation: obj.orientation } : {}),
    ...(typeof obj.rotation === "number" && Number.isFinite(obj.rotation) ? { rotation: obj.rotation } : {}),
    ...(typeof obj.state === "string" && obj.state.length > 0 ? { state: obj.state } : {}),
  };
}

export function parseAxeDisplaysOutput(stdout: string): DeviceDisplayMetadata | undefined {
  try {
    const parsed = JSON.parse(stdout) as {
      data?: {
        result?: {
          activeScreen?: unknown;
          otherScreens?: unknown;
          hinge?: unknown;
        };
      };
    };
    const result = parsed?.data?.result;
    if (!result) {
      return undefined;
    }
    const activeScreen = toDisplayScreen(result.activeScreen);
    if (!activeScreen) {
      return undefined;
    }

    const otherScreens = Array.isArray(result.otherScreens)
      ? result.otherScreens
          .map(toDisplayScreen)
          .filter((item): item is DeviceDisplayScreen => item !== undefined)
      : undefined;

    let hinge: DeviceDisplayMetadata["hinge"];
    if (result.hinge && typeof result.hinge === "object" && !Array.isArray(result.hinge)) {
      const h = result.hinge as Record<string, unknown>;
      const extracted = {
        ...(typeof h.degrees === "number" && Number.isFinite(h.degrees) ? { degrees: h.degrees } : {}),
        ...(typeof h.mechanicalDegrees === "number" && Number.isFinite(h.mechanicalDegrees)
          ? { mechanicalDegrees: h.mechanicalDegrees }
          : {}),
        ...(typeof h.posture === "string" && h.posture.length > 0 ? { posture: h.posture } : {}),
      };
      if (Object.keys(extracted).length > 0) {
        hinge = extracted;
      }
    }

    return {
      activeScreen,
      ...(otherScreens && otherScreens.length > 0 ? { otherScreens } : {}),
      ...(hinge ? { hinge } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function enrichIosSimulatorDisplayMetadata(
  repoRoot: string,
  iosDevices: DeviceInfo[],
  deps: IosSimulatorEnvDeps = {},
): Promise<DeviceInfo[]> {
  const run = deps.execute ?? executeRunner;
  return Promise.all(
    iosDevices.map(async (device) => {
      if (
        !device.available ||
        device.state.toLowerCase() !== "booted" ||
        !isIosSimulatorUdid(device.id)
      ) {
        return device;
      }
      try {
        const execResult = await run(
          ["axe", "--output", "json", "displays", "--udid", device.id],
          repoRoot,
          process.env,
          { timeoutMs: DEFAULT_DISPLAYS_PROBE_TIMEOUT_MS },
        );
        if (execResult.exitCode !== 0) {
          return device;
        }
        const displays = parseAxeDisplaysOutput(execResult.stdout);
        return displays ? { ...device, displays } : device;
      } catch {
        return device;
      }
    }),
  );
}
