# Docs Index

This directory contains all documentation for mobile-e2e-mcp.

## Core References

| Directory | Content |
|---|---|
| [architecture/](./architecture/) | System architecture, platform adapters, capability model, runtime design, governance |
| [guides/](./guides/) | Setup guides, usage guides, and operational manuals |
| [delivery/](./delivery/) | Delivery roadmap and release processes |
| [showcase/](./showcase/) | Reproducible real-device demo evidence |
| [strategy/](./strategy/) | Differentiation strategy and ecosystem landscape |
| [engineering/](./engineering/) | Durable implementation guidance for contributors |
| [testing/](./testing/) | Probe checklists, coverage baseline, and test review notes |
| [validation/](./validation/) | Historical cross-platform validation findings and result summaries |
| [templates/](./templates/) | Reusable templates for ADRs, bug packets, phase charters, etc. |

## Quick Links

### Getting Started

1. [README.md](../README.md) — project overview
2. [External Tools Setup](./guides/external-tools.md) — install all dependencies
3. [WDA Setup (iOS physical)](./guides/wda-setup.md) — WebDriverAgent build and connection
4. [Golden Path](./guides/golden-path.md) — first-run closed loop
5. [AI Agent Invocation](./guides/ai-agent-invocation.zh-CN.md) — tool selection guide (zh-CN)
6. [Agent Policy Prompt Sync](./guides/agent-policy-prompt-sync.md) — repo-owned prompt policy sources and OpenCode runtime sync
7. [CI Evidence and Boundary Guide](./showcase/ci-evidence.md) — CI jobs, artifacts, proof levels, and real-device boundary

### Architecture

1. [01-system-architecture.md](./architecture/01-system-architecture.md) — topology, contracts, reliability
2. [02-platform-adapters.md](./architecture/02-platform-adapters.md) — Android/iOS backends
3. [03-capability-model.md](./architecture/03-capability-model.md) — AI-first capabilities, maturity levels
4. [04-runtime-architecture.md](./architecture/04-runtime-architecture.md) — execution coordinator, fallback, recovery
5. [05-governance-security.md](./architecture/05-governance-security.md) — policy, audit, human handoff

### Delivery

1. [Roadmap](./delivery/roadmap.md) — phase-level delivery direction
2. [NPM Release & Git Tagging](./delivery/npm-release-and-git-tagging.zh-CN.md) — release process (zh-CN)

### Engineering Guidelines

1. [AI-First Capability Expansion](./engineering/ai-first-capability-expansion-guideline.md) — how to add new capabilities correctly
2. [Explorer Rule Registry](./engineering/explorer-rule-registry.zh-CN.md) — how to add, disable, override, validate, and report Explorer traversal rules (zh-CN)
3. [Output Directory Layout](./engineering/output-directory-layout.md) — runtime evidence/report roots and legacy cleanup guidance

### Testing And Evidence

1. [CI Evidence and Boundary Guide](./showcase/ci-evidence.md) — current CI proof levels, artifacts, and limitations
2. [Android Tool Probe Checklist](./testing/android-tool-probe-checklist.md) — Android probe scope plus current Android Explorer physical-device evidence
3. [iOS Tool Probe Checklist](./testing/ios-tool-probe-checklist.md) — iOS probe scope and operational notes
4. [Probe Evidence Contract](./engineering/probe-evidence-contract.md) — JSON/Markdown probe report schema and validation commands
5. [Explorer Visual Baselines](./guides/explorer-visual-baselines.md) — failure-review visual baseline workflow
