# Legacy Scripts

This directory keeps historical runners, one-off debug helpers, and old showcase wrappers that are no longer canonical entrypoints.

Current preferred entrypoints:

- Explorer: `scripts/explorer/**`
- Probes: `scripts/dev/*probe*`
- Package/CI validation: `package.json` scripts and `.github/workflows/**`

Legacy scripts may still be referenced by archived planning notes or compatibility wrappers, but new automation should prefer Explorer, probes, or the maintained validation scripts.

`scripts/legacy/dev/run-sample-phase-matrix.sh` is intentionally kept as the `validate:phase3-real-run` compatibility matrix wrapper. It replays historical sample lanes for report generation; it is not the primary real-device proof path now that Explorer and probe runs cover the tool surface directly.
