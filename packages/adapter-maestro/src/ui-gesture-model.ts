import type {
  DragGestureSpec,
  DrawGestureSpec,
  DoubleTapGestureSpec,
  PerformGestureCoordinateMode,
  PerformGestureInput,
  PerformGestureKind,
  PerformGestureSpec,
  PinchGestureSpec,
  ScrollOnlyContainerBounds,
  TwoFingerTapGestureSpec,
  UiPoint,
} from "@mobile-e2e-mcp/contracts";

export const DEFAULT_GESTURE_DRAW_DURATION_MS = 800;
export const DEFAULT_GESTURE_DRAG_DURATION_MS = 600;
export const DEFAULT_GESTURE_PINCH_DURATION_MS = 600;
export const DEFAULT_GESTURE_DOUBLE_TAP_INTERVAL_MS = 100;
export const DEFAULT_GESTURE_SETTLE_DELAY_MS = 400;
export const DEFAULT_GESTURE_VIEWPORT_WIDTH = 1080;
export const DEFAULT_GESTURE_VIEWPORT_HEIGHT = 1920;

export type NormalizedPerformGesture =
  | {
      type: "draw";
      coordinateMode: PerformGestureCoordinateMode;
      containerBounds?: ScrollOnlyContainerBounds;
      points: UiPoint[];
      durationMs: number;
      close: boolean;
      preDelayMs?: number;
      postDelayMs?: number;
    }
  | {
      type: "drag";
      coordinateMode: PerformGestureCoordinateMode;
      containerBounds?: ScrollOnlyContainerBounds;
      start: UiPoint;
      end: UiPoint;
      durationMs: number;
      steps?: number;
      holdMs?: number;
      preDelayMs?: number;
      postDelayMs?: number;
    }
  | {
      type: "pinch";
      coordinateMode: PerformGestureCoordinateMode;
      containerBounds?: ScrollOnlyContainerBounds;
      scale: number;
      center?: UiPoint;
      radius?: number;
      durationMs: number;
      delta?: number;
      preDelayMs?: number;
      postDelayMs?: number;
    }
  | {
      type: "double_tap";
      coordinateMode: PerformGestureCoordinateMode;
      containerBounds?: ScrollOnlyContainerBounds;
      point: UiPoint;
      intervalMs: number;
      preDelayMs?: number;
      postDelayMs?: number;
    }
  | {
      type: "two_finger_tap";
      coordinateMode: PerformGestureCoordinateMode;
      containerBounds?: ScrollOnlyContainerBounds;
      point1: UiPoint;
      point2: UiPoint;
      preDelayMs?: number;
      postDelayMs?: number;
    };

export type ResolvedPerformGesture = NormalizedPerformGesture;

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatAxeSeconds(ms: number): string {
  const sec = Number((ms / 1000).toFixed(3));
  return String(sec);
}

function validateDelayMs(value: number | undefined, field: string): number | undefined | string {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10000) {
    return `${field} must be a finite number between 0 and 10000 ms.`;
  }
  return Math.round(value);
}

function validateContainerBounds(bounds: ScrollOnlyContainerBounds | undefined): ScrollOnlyContainerBounds | undefined | string {
  if (bounds === undefined) return undefined;
  if (
    typeof bounds.x !== "number" || !Number.isFinite(bounds.x) ||
    typeof bounds.y !== "number" || !Number.isFinite(bounds.y) ||
    typeof bounds.width !== "number" || !Number.isFinite(bounds.width) || bounds.width <= 0 ||
    typeof bounds.height !== "number" || !Number.isFinite(bounds.height) || bounds.height <= 0
  ) {
    return "containerBounds must specify finite x, y and positive width, height.";
  }
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function validatePoint(point: UiPoint | undefined, label: string, coordinateMode: PerformGestureCoordinateMode): UiPoint | string {
  if (!point || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
    return `${label} must specify finite x and y numbers.`;
  }
  if (coordinateMode === "normalized" && (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
    return `${label} must stay within [0, 1] when coordinateMode is 'normalized'.`;
  }
  return { x: point.x, y: point.y };
}

function parseCoordinateMode(
  raw: unknown,
): { mode: PerformGestureCoordinateMode } | { error: string } {
  if (raw === undefined) return { mode: "absolute" };
  if (raw === "absolute" || raw === "normalized") return { mode: raw };
  return {
    error: `Unsupported coordinateMode '${String(raw)}'. Expected 'absolute' or 'normalized'.`,
  };
}

function validateDrawGesture(spec: DrawGestureSpec): NormalizedPerformGesture | string {
  const modeResult = parseCoordinateMode(spec.coordinateMode);
  if ("error" in modeResult) return modeResult.error;
  const mode = modeResult.mode;
  const containerBounds = validateContainerBounds(spec.containerBounds);
  if (typeof containerBounds === "string") return containerBounds;
  if (!Array.isArray(spec.points) || spec.points.length < 2 || spec.points.length > 1000) {
    return "draw gesture requires 2 to 1000 points.";
  }
  const points: UiPoint[] = [];
  for (let i = 0; i < spec.points.length; i += 1) {
    const pt = validatePoint(spec.points[i], `points[${i}]`, mode);
    if (typeof pt === "string") return pt;
    points.push(pt);
  }
  const durationMs = spec.durationMs ?? DEFAULT_GESTURE_DRAW_DURATION_MS;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30000) {
    return "draw durationMs must be > 0 and <= 30000.";
  }
  const preDelayMs = validateDelayMs(spec.preDelayMs, "preDelayMs");
  if (typeof preDelayMs === "string") return preDelayMs;
  const postDelayMs = validateDelayMs(spec.postDelayMs, "postDelayMs");
  if (typeof postDelayMs === "string") return postDelayMs;

  return {
    type: "draw",
    coordinateMode: mode,
    ...(containerBounds ? { containerBounds } : {}),
    points,
    durationMs: Math.round(durationMs),
    close: Boolean(spec.close),
    ...(preDelayMs !== undefined ? { preDelayMs } : {}),
    ...(postDelayMs !== undefined ? { postDelayMs } : {}),
  };
}

function validateDragGesture(spec: DragGestureSpec): NormalizedPerformGesture | string {
  const modeResult = parseCoordinateMode(spec.coordinateMode);
  if ("error" in modeResult) return modeResult.error;
  const mode = modeResult.mode;
  const containerBounds = validateContainerBounds(spec.containerBounds);
  if (typeof containerBounds === "string") return containerBounds;
  const start = validatePoint(spec.start, "start", mode);
  if (typeof start === "string") return start;
  const end = validatePoint(spec.end, "end", mode);
  if (typeof end === "string") return end;
  const durationMs = spec.durationMs ?? DEFAULT_GESTURE_DRAG_DURATION_MS;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30000) {
    return "drag durationMs must be > 0 and <= 30000.";
  }
  let steps: number | undefined;
  if (spec.steps !== undefined) {
    if (typeof spec.steps !== "number" || !Number.isInteger(spec.steps) || spec.steps < 1 || spec.steps > 1000) {
      return "drag steps must be an integer between 1 and 1000.";
    }
    steps = spec.steps;
  }
  const holdMs = validateDelayMs(spec.holdMs, "holdMs");
  if (typeof holdMs === "string") return holdMs;
  const preDelayMs = validateDelayMs(spec.preDelayMs, "preDelayMs");
  if (typeof preDelayMs === "string") return preDelayMs;
  const postDelayMs = validateDelayMs(spec.postDelayMs, "postDelayMs");
  if (typeof postDelayMs === "string") return postDelayMs;

  return {
    type: "drag",
    coordinateMode: mode,
    ...(containerBounds ? { containerBounds } : {}),
    start,
    end,
    durationMs: Math.round(durationMs),
    ...(steps !== undefined ? { steps } : {}),
    ...(holdMs !== undefined ? { holdMs } : {}),
    ...(preDelayMs !== undefined ? { preDelayMs } : {}),
    ...(postDelayMs !== undefined ? { postDelayMs } : {}),
  };
}

function validatePinchGesture(spec: PinchGestureSpec): NormalizedPerformGesture | string {
  const modeResult = parseCoordinateMode(spec.coordinateMode);
  if ("error" in modeResult) return modeResult.error;
  const mode = modeResult.mode;
  const containerBounds = validateContainerBounds(spec.containerBounds);
  if (typeof containerBounds === "string") return containerBounds;
  if (typeof spec.scale !== "number" || !Number.isFinite(spec.scale) || spec.scale <= 0 || spec.scale === 1) {
    return "pinch scale must be a finite number > 0 and !== 1.";
  }
  let center: UiPoint | undefined;
  if (spec.center !== undefined) {
    const validatedCenter = validatePoint(spec.center, "center", mode);
    if (typeof validatedCenter === "string") return validatedCenter;
    center = validatedCenter;
  }
  if (spec.radius !== undefined && (typeof spec.radius !== "number" || !Number.isFinite(spec.radius) || spec.radius <= 0)) {
    return "pinch radius must be a positive finite number.";
  }
  const durationMs = spec.durationMs ?? DEFAULT_GESTURE_PINCH_DURATION_MS;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 10000) {
    return "pinch durationMs must be > 0 and <= 10000.";
  }
  if (spec.delta !== undefined && (typeof spec.delta !== "number" || !Number.isFinite(spec.delta) || spec.delta <= 0 || spec.delta > 200)) {
    return "pinch delta must be > 0 and <= 200.";
  }
  const preDelayMs = validateDelayMs(spec.preDelayMs, "preDelayMs");
  if (typeof preDelayMs === "string") return preDelayMs;
  const postDelayMs = validateDelayMs(spec.postDelayMs, "postDelayMs");
  if (typeof postDelayMs === "string") return postDelayMs;

  return {
    type: "pinch",
    coordinateMode: mode,
    ...(containerBounds ? { containerBounds } : {}),
    scale: spec.scale,
    ...(center ? { center } : {}),
    ...(spec.radius !== undefined ? { radius: spec.radius } : {}),
    durationMs: Math.round(durationMs),
    ...(spec.delta !== undefined ? { delta: spec.delta } : {}),
    ...(preDelayMs !== undefined ? { preDelayMs } : {}),
    ...(postDelayMs !== undefined ? { postDelayMs } : {}),
  };
}

function validateDoubleTapGesture(spec: DoubleTapGestureSpec): NormalizedPerformGesture | string {
  const modeResult = parseCoordinateMode(spec.coordinateMode);
  if ("error" in modeResult) return modeResult.error;
  const mode = modeResult.mode;
  const containerBounds = validateContainerBounds(spec.containerBounds);
  if (typeof containerBounds === "string") return containerBounds;
  const point = validatePoint(spec.point, "point", mode);
  if (typeof point === "string") return point;
  const intervalMs = spec.intervalMs ?? DEFAULT_GESTURE_DOUBLE_TAP_INTERVAL_MS;
  if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > 10000) {
    return "double_tap intervalMs must be > 0 and <= 10000.";
  }
  const preDelayMs = validateDelayMs(spec.preDelayMs, "preDelayMs");
  if (typeof preDelayMs === "string") return preDelayMs;
  const postDelayMs = validateDelayMs(spec.postDelayMs, "postDelayMs");
  if (typeof postDelayMs === "string") return postDelayMs;

  return {
    type: "double_tap",
    coordinateMode: mode,
    ...(containerBounds ? { containerBounds } : {}),
    point,
    intervalMs: Math.round(intervalMs),
    ...(preDelayMs !== undefined ? { preDelayMs } : {}),
    ...(postDelayMs !== undefined ? { postDelayMs } : {}),
  };
}

function validateTwoFingerTapGesture(spec: TwoFingerTapGestureSpec): NormalizedPerformGesture | string {
  const modeResult = parseCoordinateMode(spec.coordinateMode);
  if ("error" in modeResult) return modeResult.error;
  const mode = modeResult.mode;
  const containerBounds = validateContainerBounds(spec.containerBounds);
  if (typeof containerBounds === "string") return containerBounds;
  const point1 = validatePoint(spec.point1, "point1", mode);
  if (typeof point1 === "string") return point1;
  const point2 = validatePoint(spec.point2, "point2", mode);
  if (typeof point2 === "string") return point2;
  const preDelayMs = validateDelayMs(spec.preDelayMs, "preDelayMs");
  if (typeof preDelayMs === "string") return preDelayMs;
  const postDelayMs = validateDelayMs(spec.postDelayMs, "postDelayMs");
  if (typeof postDelayMs === "string") return postDelayMs;

  return {
    type: "two_finger_tap",
    coordinateMode: mode,
    ...(containerBounds ? { containerBounds } : {}),
    point1,
    point2,
    ...(preDelayMs !== undefined ? { preDelayMs } : {}),
    ...(postDelayMs !== undefined ? { postDelayMs } : {}),
  };
}

/** Validates and normalizes `perform_gesture` input into an explicit gesture descriptor or error reason. */
export function normalizePerformGesture(spec: PerformGestureSpec | undefined): NormalizedPerformGesture | string {
  if (!spec || typeof spec !== "object") {
    return "gesture object is required.";
  }
  switch (spec.type) {
    case "draw":
      return validateDrawGesture(spec);
    case "drag":
      return validateDragGesture(spec);
    case "pinch":
      return validatePinchGesture(spec);
    case "double_tap":
      return validateDoubleTapGesture(spec);
    case "two_finger_tap":
      return validateTwoFingerTapGesture(spec);
    default:
      return `Unsupported gesture type '${String((spec as { type?: unknown }).type)}'. Expected draw, drag, pinch, double_tap, or two_finger_tap.`;
  }
}

function resolvePoint(
  point: UiPoint,
  coordinateMode: PerformGestureCoordinateMode,
  frame: ScrollOnlyContainerBounds,
): UiPoint {
  if (coordinateMode === "normalized") {
    return {
      x: roundCoord(frame.x + point.x * frame.width),
      y: roundCoord(frame.y + point.y * frame.height),
    };
  }
  return {
    x: roundCoord(point.x),
    y: roundCoord(point.y),
  };
}

/** Converts normalized coordinates against containerBounds or viewport bounds into absolute points. */
export function resolveGestureCoordinates(
  normalized: NormalizedPerformGesture,
  viewportBounds?: { width: number; height: number },
): {
  resolved: ResolvedPerformGesture;
  resolvedPoints: UiPoint[];
  coordinateScope: "viewport" | "container";
} {
  const coordinateScope: "viewport" | "container" = normalized.containerBounds ? "container" : "viewport";
  const frame: ScrollOnlyContainerBounds = normalized.containerBounds ?? {
    x: 0,
    y: 0,
    width: viewportBounds && viewportBounds.width > 0 ? viewportBounds.width : DEFAULT_GESTURE_VIEWPORT_WIDTH,
    height: viewportBounds && viewportBounds.height > 0 ? viewportBounds.height : DEFAULT_GESTURE_VIEWPORT_HEIGHT,
  };

  switch (normalized.type) {
    case "draw": {
      const points = normalized.points.map((pt) => resolvePoint(pt, normalized.coordinateMode, frame));
      return {
        resolved: { ...normalized, points },
        resolvedPoints: points,
        coordinateScope,
      };
    }
    case "drag": {
      const start = resolvePoint(normalized.start, normalized.coordinateMode, frame);
      const end = resolvePoint(normalized.end, normalized.coordinateMode, frame);
      return {
        resolved: { ...normalized, start, end },
        resolvedPoints: [start, end],
        coordinateScope,
      };
    }
    case "pinch": {
      const center = normalized.center
        ? resolvePoint(normalized.center, normalized.coordinateMode, frame)
        : normalized.containerBounds
          ? {
              x: roundCoord(frame.x + frame.width / 2),
              y: roundCoord(frame.y + frame.height / 2),
            }
          : undefined;
      return {
        resolved: { ...normalized, ...(center ? { center } : {}) },
        resolvedPoints: center ? [center] : [],
        coordinateScope,
      };
    }
    case "double_tap": {
      const point = resolvePoint(normalized.point, normalized.coordinateMode, frame);
      return {
        resolved: { ...normalized, point },
        resolvedPoints: [point],
        coordinateScope,
      };
    }
    case "two_finger_tap": {
      const point1 = resolvePoint(normalized.point1, normalized.coordinateMode, frame);
      const point2 = resolvePoint(normalized.point2, normalized.coordinateMode, frame);
      return {
        resolved: { ...normalized, point1, point2 },
        resolvedPoints: [point1, point2],
        coordinateScope,
      };
    }
  }
}

export function extractFallbackGestureKind(input: PerformGestureInput): PerformGestureKind {
  const kind = (input.gesture as { type?: string } | undefined)?.type;
  if (kind === "draw" || kind === "drag" || kind === "pinch" || kind === "double_tap" || kind === "two_finger_tap") {
    return kind;
  }
  return "draw";
}
