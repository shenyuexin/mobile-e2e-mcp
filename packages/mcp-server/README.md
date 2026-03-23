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

## AI agent invocation guides

- Canonical invocation guide: https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/ai-agent-invocation.zh-CN.md
- Golden path guide: https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/golden-path.md
- Flow generation guide: https://github.com/shenyuexin/mobile-e2e-mcp/blob/main/docs/guides/flow-generation.md

For full architecture and contribution docs, see:

- Repository: https://github.com/shenyuexin/mobile-e2e
- Package README source: https://github.com/shenyuexin/mobile-e2e/tree/main/packages/mcp-server#readme
