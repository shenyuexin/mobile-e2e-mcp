# Phase 36 Verification

## Commands

```bash
pnpm run proof:governed-agent-mobile-control
```

Result: PASS. The proof generated a timestamped bundle and reported `policyDenied: true`.

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package json ok')"
```

Result: PASS.

```bash
git diff --check
```

Result: PASS.

## Notes

- The proof command may require a non-sandboxed run in this environment because `tsx` creates an IPC pipe.
- The proof is dry-run only. It validates control-plane value, not live-device fidelity.
- `suggest_known_remediation` now returns governance-specific next steps for the policy-denial path after the follow-up optimization.
