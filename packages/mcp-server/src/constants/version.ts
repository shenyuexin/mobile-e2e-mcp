import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FALLBACK_MCP_SERVER_VERSION = "0.1.19";

export function resolveMcpServerVersion(): string {
  try {
    const startDir = path.dirname(fileURLToPath(import.meta.url));
    let currentDir = startDir;
    for (let depth = 0; depth < 4; depth += 1) {
      const candidatePath = path.join(currentDir, "package.json");
      if (existsSync(candidatePath)) {
        const parsed = JSON.parse(readFileSync(candidatePath, "utf8")) as {
          name?: unknown;
          version?: unknown;
        };
        if (parsed.name === "@shenyuexin/mobile-e2e-mcp" && typeof parsed.version === "string" && parsed.version.length > 0) {
          return parsed.version;
        }
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
  } catch {
    // Fall back to packaged default when package.json cannot be read.
  }
  return FALLBACK_MCP_SERVER_VERSION;
}
