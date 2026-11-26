# @shenyuexin/mobile-e2e-mcp

AI-first Mobile E2E MCP server and unified CLI for Android / iOS / React Native / Flutter.

- GitHub: https://github.com/shenyuexin/mobile-e2e-mcp
- Issues: https://github.com/shenyuexin/mobile-e2e-mcp/issues
- NPM: https://www.npmjs.com/package/@shenyuexin/mobile-e2e-mcp

## Install and Run (MCP stdio)

By default, the MCP stdio server exposes the **`core` toolset (20 high-frequency tools, ~71% fewer schemas)** including `audit_ui_surface`, `perform_gesture`, and `record_screen`:

```bash
npx -y @shenyuexin/mobile-e2e-mcp@latest
```

To expose all **68 MCP tools** (recording/replay, failure intelligence, network policy/diagnosis, performance, JS debug targets), pass `--toolset full` or set `MOBILE_E2E_TOOLSET=full`:

```bash
npx -y @shenyuexin/mobile-e2e-mcp@latest --toolset full
```

## Unified CLI Commands

The single package binary supports both MCP stdio serving and local CLI workflows (`stdio`, `doctor`, `init`, `explore`, `run`):

```bash
# Check Android/iOS host tools and connected devices
npx -y @shenyuexin/mobile-e2e-mcp@latest doctor

# Generate .e2e/config.yaml in the current project
npx -y @shenyuexin/mobile-e2e-mcp@latest init --platform ios --app-id com.example.app --no-prompt

# Run automatic page exploration
npx -y @shenyuexin/mobile-e2e-mcp@latest explore --app-id com.example.app --platform android --output ./explore-report

# Run a deterministic flow inside a governed session
npx -y @shenyuexin/mobile-e2e-mcp@latest run flows/smoke.yaml --dry-run
```

## OpenCode MCP config

Default `core` toolset (recommended for low schema overhead):

```json
{
  "mcp": {
    "mobile-e2e-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@shenyuexin/mobile-e2e-mcp@latest"],
      "enabled": true
    }
  }
}
```

Pass `"--toolset", "full"` inside `command` (or set `MOBILE_E2E_TOOLSET=full`) when you need all 68 tools.

## AI agent invocation guides

- Canonical invocation guide: https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/ai-agent-invocation.zh-CN.md
- Golden path guide: https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/golden-path.md
- Flow generation guide: https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/flow-generation.md

For full architecture and contribution docs, see:

- Repository: https://github.com/shenyuexin/mobile-e2e-mcp
- Package README source: https://github.com/shenyuexin/mobile-e2e-mcp/tree/main/packages/mcp-server#readme
