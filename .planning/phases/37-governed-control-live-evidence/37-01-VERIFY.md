# Phase 37 Verification

## Commands

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package json ok')"
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

```bash
M2E_LIVE_PROOF_ALLOW_NO_DEVICE=1 pnpm run proof:governed-agent-mobile-control:live
```

Result: PASS for the no-device path. The script wrote:

```text
output/showcase/governed-agent-mobile-control-live/2026-05-23T08-51-29-727Z
```

The generated `live-proof.json` reported:

```json
{
  "verdict": "device_unavailable",
  "steps": [
    {
      "name": "list_devices",
      "status": "partial",
      "reasonCode": "DEVICE_UNAVAILABLE"
    }
  ]
}
```

## Vivo Physical-Device Verification

The live proof was rerun without `M2E_LIVE_PROOF_ALLOW_NO_DEVICE` after allowing `adb` to access the attached vivo device outside the sandbox:

```bash
adb devices -l
```

Result:

```text
10AEA40Z3Y000R5 device usb:1-1 product:PD2405M model:V2405A device:PD2405 transport_id:2
```

```bash
pnpm run proof:governed-agent-mobile-control:live
```

Result: PASS.

```text
output/showcase/governed-agent-mobile-control-live/2026-05-23T08-56-47-448Z
verdict: live_governed_control_observed
deviceId: 10AEA40Z3Y000R5
sessionId: governed-agent-live-1779526617573
inspectedScreen: true
policyDenied: true
remediationAvailable: true
```

The generated report recorded `inspect_ui` success with `totalNodes=93` and `clickableNodes=53`, followed by `perform_action_with_evidence` returning `POLICY_DENIED` and `suggest_known_remediation` returning `OK`.

## Vivo Preflight Verification

```bash
pnpm run proof:governed-agent-mobile-control:preflight
```

Sandbox result: generated a report and failed the `android_device` check because the sandbox could not see the attached USB device.

After allowing local adb/USB access, the same command passed:

```text
output/showcase/governed-agent-mobile-control-preflight/2026-05-23T12-04-17-683Z
ready: true
selectedDeviceId: 10AEA40Z3Y000R5
android_device: pass
runner_capabilities: pass
policy_boundary: pass
```

The preflight was rerun after adding remediation hints:

```text
sandbox path: ready=false, android_device=fail, hints include adb devices, M2E_DEVICE_ID, and sandboxed adb/USB access
vivo path: ready=true, selectedDeviceId=10AEA40Z3Y000R5, android_device=pass, runner_capabilities=pass, policy_boundary=pass
```

## Tracked Evidence Validation

```bash
pnpm run validate:governed-control-evidence
```

Result: PASS. The tracked summary preserves the vivo proof verdict and compact evidence metrics without committing the full UI hierarchy.
