# @shenyuexin/mobile-e2e-mcp

AI-first Mobile E2E MCP server for Android/iOS/React Native/Flutter.

- GitHub: https://github.com/shenyuexin/mobile-e2e
- Issues: https://github.com/shenyuexin/mobile-e2e/issues
- NPM: https://www.npmjs.com/package/@shenyuexin/mobile-e2e-mcp

## Install and Run (MCP stdio)

```bash
npx -y @shenyuexin/mobile-e2e-mcp@latest
```

## OpenCode MCP config

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

## Key tools

- `describe_capabilities`
- `start_session` / `end_session`
- `run_flow`
- `inspect_ui`, `query_ui`, `wait_for_ui`
- `tap_element`, `type_into_element`, `scroll_and_tap_element`
- `get_logs`, `get_crash_signals`, `collect_debug_evidence`

## Golden path guide

- https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/golden-path.md

For full architecture and contribution docs, see:

- Repository: https://github.com/shenyuexin/mobile-e2e
- Package README source: https://github.com/shenyuexin/mobile-e2e/tree/main/packages/mcp-server#readme
