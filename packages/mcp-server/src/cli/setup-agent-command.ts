import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { dirname, join, relative } from "node:path";

/** Agent clients supported by the one-command setup flow. */
export type SetupAgentTarget = "claude" | "cursor" | "opencode" | "codex";
export type SetupAgentToolset = "core" | "full";

const VALID_TARGETS: readonly SetupAgentTarget[] = ["claude", "cursor", "opencode", "codex"];
const MCP_SERVER_NAME = "mobile-e2e-mcp";
const PACKAGE_SPEC = "@shenyuexin/mobile-e2e-mcp@latest";
const GUIDANCE_BEGIN = "<!-- mobile-e2e-mcp:begin -->";
const GUIDANCE_END = "<!-- mobile-e2e-mcp:end -->";

export interface SetupAgentOptions {
  target?: SetupAgentTarget;
  toolset: SetupAgentToolset;
  cwd?: string;
  dryRun: boolean;
  force: boolean;
  json: boolean;
  help: boolean;
  error?: string;
}

export interface SetupAgentFilePlan {
  path: string;
  relativePath: string;
  kind: "mcp-config" | "guidance";
  action: "create" | "update" | "unchanged";
  content: string;
}

export interface SetupAgentPlan {
  target: SetupAgentTarget;
  toolset: SetupAgentToolset;
  cwd: string;
  files: SetupAgentFilePlan[];
  error?: string;
}

function printSetupAgentHelp(): void {
  console.log(`Usage: mobile-e2e-mcp setup-agent --target <claude|cursor|opencode|codex> [options]

Install the mobile-e2e-mcp MCP server and concise workflow guidance for an AI coding client.
Existing unrelated MCP servers in the target config are always preserved.

Options:
  --target <name>     claude | cursor | opencode | codex
  --toolset <name>    core (default, 20 tools) | full (68 tools)
  --cwd <path>        Workspace root (default: current directory)
  --dry-run           Print the plan without writing files
  --force             Replace an existing managed guidance section
  --json              Print structured JSON output
  --help, -h          Show this help message`);
}

export function parseSetupAgentArgs(argv: string[]): SetupAgentOptions {
  const options: SetupAgentOptions = {
    toolset: "core",
    dryRun: false,
    force: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--target" && next) {
      if (!VALID_TARGETS.includes(next as SetupAgentTarget)) {
        options.error = `Invalid --target "${next}". Expected one of: ${VALID_TARGETS.join(", ")}.`;
        return options;
      }
      options.target = next as SetupAgentTarget;
      i += 1;
    } else if (arg === "--toolset" && next) {
      if (next !== "core" && next !== "full") {
        options.error = `Invalid --toolset "${next}". Expected "core" or "full".`;
        return options;
      }
      options.toolset = next;
      i += 1;
    } else if (arg === "--cwd" && next) {
      options.cwd = next;
      i += 1;
    }
  }
  return options;
}

function npxArgs(toolset: SetupAgentToolset): string[] {
  return ["-y", PACKAGE_SPEC, ...(toolset === "full" ? ["--toolset", "full"] : [])];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function serialized(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Merge the MCP server entry into a JSON config, preserving all other keys. */
export function mergeJsonMcpConfig(
  existingText: string | undefined,
  target: "claude" | "cursor" | "opencode",
  toolset: SetupAgentToolset,
): { content?: string; changed: boolean; error?: string } {
  if (!existingText || !existingText.trim()) {
    const entry = target === "opencode"
      ? { type: "local", command: ["npx", ...npxArgs(toolset)], enabled: true }
      : { command: "npx", args: npxArgs(toolset) };
    const root = target === "opencode"
      ? { mcp: { [MCP_SERVER_NAME]: entry } }
      : { mcpServers: { [MCP_SERVER_NAME]: entry } };
    return { content: serialized(root), changed: true };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(existingText)) ?? {};
  } catch {
    return {
      changed: false,
      error: "Existing MCP config is not valid JSON; fix it or remove it before running setup-agent.",
    };
  }

  const key = target === "opencode" ? "mcp" : "mcpServers";
  const servers = { ...(asRecord(parsed[key]) ?? {}) };
  servers[MCP_SERVER_NAME] = target === "opencode"
    ? { type: "local", command: ["npx", ...npxArgs(toolset)], enabled: true }
    : { command: "npx", args: npxArgs(toolset) };
  const next = { ...parsed, [key]: servers };
  const changed = serialized(parsed) !== serialized(next);
  return changed ? { content: serialized(next), changed: true } : { content: existingText, changed: false };
}

function desiredTomlSection(toolset: SetupAgentToolset): string {
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    'command = "npx"',
    `args = [${npxArgs(toolset).map((arg) => `"${arg}"`).join(", ")}]`,
  ].join("\n");
}

/** Merge the MCP server section into Codex TOML, preserving other sections. */
export function mergeTomlMcpConfig(
  existingText: string | undefined,
  toolset: SetupAgentToolset,
  force: boolean,
): { content: string; changed: boolean; error?: string } {
  const desired = desiredTomlSection(toolset);
  const text = existingText ?? "";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[mcp_servers.${MCP_SERVER_NAME}]`);
  if (start === -1) {
    const content = text.trim().length === 0
      ? `${desired}\n`
      : `${text.replace(/\s+$/, "")}\n\n${desired}\n`;
    return { content, changed: true };
  }
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end] ?? "")) end += 1;
  const currentSection = lines.slice(start, end).join("\n").trim();
  if (currentSection === desired) return { content: text, changed: false };
  if (!force) return { content: text, changed: false };
  const nextLines = [...lines.slice(0, start), desired, ...lines.slice(end)];
  return { content: `${nextLines.join("\n").replace(/\s+$/, "")}\n`, changed: true };
}

/** Idempotently insert or replace a managed guidance block. */
export function mergeManagedGuidance(
  existingText: string | undefined,
  section: string,
  force: boolean,
): { content: string; changed: boolean } {
  const text = existingText ?? "";
  const begin = text.indexOf(GUIDANCE_BEGIN);
  const end = begin === -1 ? -1 : text.indexOf(GUIDANCE_END, begin);
  if (begin !== -1 && end !== -1) {
    const existingSection = text.slice(begin, end + GUIDANCE_END.length);
    if (existingSection === section) return { content: text, changed: false };
    if (!force) return { content: text, changed: false };
    return {
      content: `${text.slice(0, begin)}${section}${text.slice(end + GUIDANCE_END.length)}`,
      changed: true,
    };
  }
  const content = text.trim().length === 0
    ? `${section}\n`
    : `${text.replace(/\s+$/, "")}\n\n${section}\n`;
  return { content, changed: true };
}

function buildGuidanceSection(toolset: SetupAgentToolset): string {
  return [
    GUIDANCE_BEGIN,
    "## mobile-e2e-mcp workflow",
    "",
    `- Setup: \`npx -y ${PACKAGE_SPEC} init --no-prompt\``,
    `- Diagnose host: \`npx -y ${PACKAGE_SPEC} doctor\``,
    `- Explore and export flows: \`npx -y ${PACKAGE_SPEC} explore --no-prompt --export-flows ./flows/generated\``,
    `- Run a flow: \`npx -y ${PACKAGE_SPEC} run .e2e/flows/smoke.yaml --dry-run\``,
    "- After every tap add 1500ms settle; after launch add 3000ms settle.",
    `- Default toolset is core (20 tools); pass \`--toolset full\` for all 68 tools (current: ${toolset}).`,
    GUIDANCE_END,
  ].join("\n");
}

function pathsForTarget(target: SetupAgentTarget, cwd: string): { configPath: string; guidancePath: string } {
  switch (target) {
    case "claude":
      return { configPath: join(cwd, ".mcp.json"), guidancePath: join(cwd, "CLAUDE.md") };
    case "cursor":
      return { configPath: join(cwd, ".cursor", "mcp.json"), guidancePath: join(cwd, ".cursor", "rules", "mobile-e2e.mdc") };
    case "opencode":
      return { configPath: join(cwd, "opencode.json"), guidancePath: join(cwd, "AGENTS.md") };
    case "codex":
      return { configPath: join(cwd, ".codex", "config.toml"), guidancePath: join(cwd, "AGENTS.md") };
  }
}

function readIfExists(filePath: string): string | undefined {
  return existsSync(filePath) ? readFileSync(filePath, "utf-8") : undefined;
}

/** Build a complete write plan without mutating the workspace. */
export function planSetupAgent(argv: string[], cwd: string = process.cwd()): SetupAgentPlan {
  const options = parseSetupAgentArgs(argv);
  if (options.error) return { target: "claude", toolset: options.toolset, cwd, files: [], error: options.error };
  const target = options.target ?? "claude";
  const effectiveCwd = options.cwd ?? cwd;
  const { configPath, guidancePath } = pathsForTarget(target, effectiveCwd);
  const guidanceSection = buildGuidanceSection(options.toolset);

  const configMerge = target === "codex"
    ? mergeTomlMcpConfig(readIfExists(configPath), options.toolset, options.force)
    : mergeJsonMcpConfig(readIfExists(configPath), target, options.toolset);
  if (configMerge.error) {
    return { target, toolset: options.toolset, cwd: effectiveCwd, files: [], error: configMerge.error };
  }
  const guidanceMerge = mergeManagedGuidance(readIfExists(guidancePath), guidanceSection, options.force);

  const files: SetupAgentFilePlan[] = [
    {
      path: configPath,
      relativePath: relative(effectiveCwd, configPath),
      kind: "mcp-config",
      action: configMerge.changed ? (existsSync(configPath) ? "update" : "create") : "unchanged",
      content: configMerge.content ?? "",
    },
    {
      path: guidancePath,
      relativePath: relative(effectiveCwd, guidancePath),
      kind: "guidance",
      action: guidanceMerge.changed ? (existsSync(guidancePath) ? "update" : "create") : "unchanged",
      content: guidanceMerge.content,
    },
  ];
  return { target, toolset: options.toolset, cwd: effectiveCwd, files };
}

export async function executeSetupAgent(
  argv: string[],
  cwd: string = process.cwd(),
): Promise<number> {
  const options = parseSetupAgentArgs(argv);
  if (options.help) {
    printSetupAgentHelp();
    return 0;
  }
  if (options.error) {
    console.error(options.error);
    return 2;
  }
  if (!options.target) {
    console.error('Missing --target. Expected one of: claude, cursor, opencode, codex.');
    return 2;
  }

  const plan = planSetupAgent(argv, cwd);
  if (plan.error) {
    console.error(plan.error);
    return 2;
  }

  if (!options.dryRun) {
    for (const file of plan.files) {
      if (file.action === "unchanged") continue;
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content, "utf-8");
    }
  }

  const summary = plan.files.map((file) => ({
    path: file.relativePath || file.path,
    kind: file.kind,
    action: options.dryRun ? `would-${file.action}` : file.action,
  }));

  if (options.json) {
    console.log(JSON.stringify({
      target: plan.target,
      toolset: plan.toolset,
      cwd: plan.cwd,
      dryRun: options.dryRun,
      files: summary,
    }, null, 2));
  } else {
    console.log(`mobile-e2e-mcp setup-agent — target=${plan.target} toolset=${plan.toolset}${options.dryRun ? " (dry-run)" : ""}`);
    for (const file of summary) {
      console.log(`  ${file.action}: ${file.path} [${file.kind}]`);
    }
    console.log("  MCP server entry: mobile-e2e-mcp (existing servers preserved)");
  }
  return 0;
}
