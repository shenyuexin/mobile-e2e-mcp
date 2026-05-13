# Output Directory Layout

Runtime output is centralized under `output/`.

| Path | Purpose | Versioned? |
|---|---|---|
| `output/evidence/` | Runtime evidence: sessions, actions, screenshots, logs, UI dumps, diagnostics, recordings, leases, scheduler/audit data | No |
| `output/reports/` | Structured JSON/Markdown summaries from validation, acceptance, and probe scripts | No |
| `output/tmp/` | Ephemeral/manual/debug files | No |
| `docs/showcase/` | Curated showcase assets intentionally referenced by README/docs | Yes |

Legacy `artifacts/` and `reports/` are still gitignored so old local runs do not become tracked files, but new code and scripts should write to `output/`.

## Cleanup guidance

To inspect old local output before deleting it:

```bash
bash scripts/legacy/dev/cleanup-legacy-output-roots.sh
```

To remove legacy local output after confirming no evidence needs to be preserved:

```bash
bash scripts/legacy/dev/cleanup-legacy-output-roots.sh --delete
```

The cleanup script only targets the legacy root directories `artifacts/` and `reports/`; it does not touch curated files under `docs/showcase/`.
