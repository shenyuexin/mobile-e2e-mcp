/**
 * Explore subcommand handler for the mcp-server CLI.
 *
 * Imports the explore function from @mobile-e2e-mcp/explorer and
 * delegates to it with the parsed CLI options.
 */

import type { MobileE2EMcpServer } from "../server.js";
import type { CliOptions } from "./types.js";

/**
 * Handle the `explore` subcommand.
 *
 * @param server — the MCP server instance
 * @param options — parsed CLI options
 */
export async function executeExplore(
  server: MobileE2EMcpServer,
  options: CliOptions,
): Promise<void> {
  // Dynamically import the explore function to avoid circular deps
  const { explore } = await import("@mobile-e2e-mcp/explorer");

  // Build argv for the explorer CLI parser
  const exploreArgs: string[] = [];

  if (options.exploreMode) {
    exploreArgs.push("--mode", options.exploreMode);
  }
  if (options.appId) {
    exploreArgs.push("--app-id", options.appId);
  }
  const resolvedExplorePlatform = options.explorePlatform
    ?? (options.platform === "ios" ? "ios-simulator" : options.platform === "android" ? "android-emulator" : undefined);
  if (resolvedExplorePlatform) {
    exploreArgs.push("--platform", resolvedExplorePlatform);
  }
  if (options.deviceId) {
    exploreArgs.push("--device-id", options.deviceId);
  }
  if (options.exploreLaunchEnv) {
    for (const [key, value] of Object.entries(options.exploreLaunchEnv)) {
      exploreArgs.push("--launch-env", `${key}=${value}`);
    }
  }
  if (options.exploreNoPrompt) {
    exploreArgs.push("--no-prompt");
  }
  if (options.exploreConfig) {
    exploreArgs.push("--config", options.exploreConfig);
  }
  if (options.exploreOutput) {
    exploreArgs.push("--output", options.exploreOutput);
  }
  if (options.exploreCompare) {
    exploreArgs.push("--compare", options.exploreCompare);
  }
  if (options.exploreMaxDepth !== undefined) {
    exploreArgs.push("--max-depth", String(options.exploreMaxDepth));
  }
  if (options.timeoutMs) {
    exploreArgs.push("--timeout-ms", String(options.timeoutMs));
  }

  // Cast server to InvokableServer — MobileE2EMcpServer.invoke is a compatible subtype
  await explore(exploreArgs, server as import("@mobile-e2e-mcp/explorer").InvokableServer);
}
