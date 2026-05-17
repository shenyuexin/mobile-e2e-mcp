# Explorer Visual Baselines

Explorer failure reviews can attach visual evidence for failed targets. When a
failed element has screenshot and bounds data, the report writes an element crop
and compares it with a managed baseline if one exists.

## Layout

For a run directory like:

```text
output/reports/explorer/<run-id>/
```

Explorer reads managed baselines from the report parent directory:

```text
output/reports/explorer/baselines/<app-id>/<screen-id>/<element-label>.png
```

When a baseline is missing, Explorer writes a candidate crop under the run:

```text
output/reports/explorer/<run-id>/visual-evidence/baseline-candidates/<app-id>/<screen-id>/<element-label>.png
```

The candidate is not promoted automatically. A failed screen can be a bad
baseline source, so promotion requires a human review.

## Promote A Candidate

Preview the promotion from a failure review:

```bash
pnpm explorer:promote-baseline --from-review output/reports/explorer/<run-id>/failure-review.json --failure-index 1 --dry-run
```

Promote after confirming the crop represents the expected UI:

```bash
pnpm explorer:promote-baseline --from-review output/reports/explorer/<run-id>/failure-review.json --failure-index 1
```

`--failure-index` is 1-based and defaults to the first failed element that has a
`baselineCandidatePath`.

Existing baselines are protected. To replace one intentionally:

```bash
pnpm explorer:promote-baseline --from-review output/reports/explorer/<run-id>/failure-review.json --failure-index 1 --force
```

## Review Rules

- Promote from known-good UI states, not from arbitrary failed states.
- Prefer stable screens and elements with deterministic labels or IDs.
- Treat large visual diffs as review signals, not automatic test failures.
- Keep baseline changes reviewable in git when baselines are committed.
