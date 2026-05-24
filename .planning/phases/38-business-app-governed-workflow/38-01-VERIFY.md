# Phase 38 Verification

## Static Checks

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"
```

Result: PASS.

```bash
git diff --check
```

Result: PASS.

```bash
pnpm --filter @shenyuexin/mobile-e2e-mcp typecheck
```

Result: PASS.

## Sandbox Path

```bash
pnpm run proof:governed-business-app-workflow
```

Result: expected non-zero in sandbox because adb/USB devices are unavailable. The command still wrote a proof bundle and reported:

```text
verdict: device_unavailable
appId: com.epam.mobitru
```

## Vivo Physical-Device Path

The first escalated run was interrupted after a long silent setup path, leaving a setup lease. The stale setup lease was closed through `end_session`, then the proof was rerun with the app already installed:

```bash
M2E_BUSINESS_SKIP_INSTALL=1 pnpm run proof:governed-business-app-workflow
```

Result: PASS.

```text
output/showcase/governed-business-app-workflow/2026-05-24T01-09-04-299Z
deviceId: 10AEA40Z3Y000R5
appId: com.epam.mobitru
verdict: business_app_governed_workflow_observed
setupLaunched: true
inspectedScreen: true
policyDenied: true
remediationAvailable: true
```

The live report captured business app UI evidence with `totalNodes=30`, `clickableNodes=6`, and `appPhase=authentication`.

## Tracked Evidence Validation

```bash
pnpm run validate:governed-business-app-evidence
```

Result: PASS.

```bash
pnpm run test:smoke
```

Result: PASS. The smoke chain now validates both governed-control Settings evidence and governed business-app evidence offline.
