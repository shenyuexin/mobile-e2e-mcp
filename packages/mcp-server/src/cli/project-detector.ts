import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Platform, RunnerProfile } from "@mobile-e2e-mcp/contracts";

/** Project family detected from on-disk files. */
export type DetectedProjectKind =
  | "flutter"
  | "react-native"
  | "expo"
  | "ios"
  | "android"
  | "unknown";

/** Deterministic project detection result used as `init` defaults. */
export interface DetectedProject {
  kind: DetectedProjectKind;
  platform?: Platform;
  appId?: string;
  runnerProfile?: RunnerProfile;
  buildCommand?: string;
  /** Files that positively contributed to the detection. */
  evidence: string[];
}

function firstExisting(cwd: string, candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(join(cwd, candidate)));
}

function readTextSafe(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function findFiles(cwd: string, predicate: (relativePath: string) => boolean, maxDepth = 3): string[] {
  const found: string[] = [];
  const walk = (directory: string, relative: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "build") continue;
        walk(join(directory, entry.name), childRelative, depth + 1);
      } else if (predicate(childRelative)) {
        found.push(childRelative);
      }
    }
  };
  walk(cwd, "", 0);
  return found.sort();
}

function matchAppId(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function readJsonSafe(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readTextSafe(filePath)) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function record(obj: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.length > 0 ? current : undefined;
}

/**
 * Detect the app family from well-known project files.
 * All signals are deterministic file reads — no device interaction.
 */
export function detectProject(cwd: string): DetectedProject {
  const pubspec = firstExisting(cwd, ["pubspec.yaml"]);
  const androidGradle = firstExisting(cwd, [
    "android/app/build.gradle",
    "android/app/build.gradle.kts",
    "app/build.gradle",
    "app/build.gradle.kts",
  ]);
  const manifest = findFiles(cwd, (p) => p.endsWith("AndroidManifest.xml")).find((p) =>
    p === "AndroidManifest.xml" || p.includes("src/main/AndroidManifest.xml"),
  );
  const pbxproj = findFiles(cwd, (p) => p.endsWith(".xcodeproj/project.pbxproj"))[0];
  const infoPlist = firstExisting(cwd, ["ios/Info.plist", "Info.plist"]);
  const appConfig = firstExisting(cwd, ["app.config.json", "app.json"]);

  const gradleText = androidGradle ? readTextSafe(join(cwd, androidGradle)) : "";
  const manifestText = manifest ? readTextSafe(join(cwd, manifest)) : "";
  const pbxText = pbxproj ? readTextSafe(join(cwd, pbxproj)) : "";
  const plistText = infoPlist ? readTextSafe(join(cwd, infoPlist)) : "";
  const androidAppId = matchAppId(gradleText, [
    /applicationId\s*=?\s*["']([^"']+)["']/,
    /namespace\s*=?\s*["']([^"']+)["']/,
  ]) ?? matchAppId(manifestText, [/package\s*=\s*["']([^"']+)["']/]);
  const iosAppId = matchAppId(pbxText, [/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*["']?([^;"']+)["']?/])
    ?? matchAppId(plistText, [/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/]);

  // Flutter: pubspec plus native project folders/configs.
  if (pubspec && (androidGradle || pbxproj || existsSync(join(cwd, "android")) || existsSync(join(cwd, "ios")))) {
    const evidence = [pubspec, ...(androidGradle ? [androidGradle] : []), ...(pbxproj ? [pbxproj] : [])];
    const hasAndroid = Boolean(androidGradle || existsSync(join(cwd, "android")));
    return {
      kind: "flutter",
      platform: hasAndroid ? "android" : "ios",
      ...(androidAppId || iosAppId ? { appId: androidAppId ?? iosAppId } : {}),
      runnerProfile: "flutter_android",
      buildCommand: hasAndroid ? "flutter build apk --debug" : "flutter build ios --debug --no-codesign",
      evidence,
    };
  }

  // React Native / Expo: JS app config is authoritative over native folders.
  if (appConfig) {
    const parsed = readJsonSafe(join(cwd, appConfig));
    const rootConfig = parsed ?? {};
    const expo = rootConfig.expo;
    const isExpo = expo !== undefined || appConfig === "app.config.json";
    const expoObj = (expo && typeof expo === "object" ? expo : rootConfig) as Record<string, unknown>;
    const androidPackage = record(expoObj, ["android", "package"]) ?? record(expoObj, ["package"]);
    const iosBundle = record(expoObj, ["ios", "bundleIdentifier"]);
    const appId = androidPackage ?? iosBundle ?? androidAppId ?? iosAppId;
    const platform: Platform = iosBundle && !androidPackage ? "ios" : "android";
    return {
      kind: isExpo ? "expo" : "react-native",
      platform,
      ...(appId ? { appId } : {}),
      runnerProfile: platform === "ios" ? "native_ios" : "native_android",
      buildCommand: isExpo
        ? platform === "ios" ? "npx expo run:ios" : "npx expo run:android"
        : platform === "ios" ? "npx react-native run-ios" : "npx react-native run-android",
      evidence: [appConfig],
    };
  }

  if (pbxproj || infoPlist) {
    return {
      kind: "ios",
      platform: "ios",
      ...(iosAppId ? { appId: iosAppId } : {}),
      runnerProfile: "native_ios",
      buildCommand: "xcodebuild -configuration Debug build",
      evidence: [pbxproj, infoPlist].filter((item): item is string => Boolean(item)),
    };
  }

  if (androidGradle || manifest) {
    return {
      kind: "android",
      platform: "android",
      ...(androidAppId ? { appId: androidAppId } : {}),
      runnerProfile: "native_android",
      buildCommand: "./gradlew assembleDebug",
      evidence: [androidGradle, manifest].filter((item): item is string => Boolean(item)),
    };
  }

  return { kind: "unknown", evidence: [] };
}
