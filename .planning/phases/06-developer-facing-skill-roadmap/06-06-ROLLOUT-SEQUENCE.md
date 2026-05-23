# Phase 06 Plan 06 Rollout Sequence

## Publication Order

### 1. Baseline first

Reason: it defines the shared invocation language and prevents duplicated platform semantics.

### 2. Android second

Reason: Android has a validated platform-specific RED/GREEN anchor (`A2`) and extends the baseline with Compose/View/hybrid distinctions.

### 3. iOS third

Reason: iOS has a validated platform-specific RED/GREEN anchor (`I1`) and extends the baseline with SwiftUI/UIKit/mixed distinctions.

## Defer Rules

Do not publish Android or iOS before baseline.

Do not publish Compose-only or SwiftUI-only overlays in the first wave unless a later slice proves the platform-level skill is insufficient.

## Rollback / Defer Conditions

If any lane loses its publication-grade RED/GREEN split during implementation, defer that lane and keep it in planning until re-validated.
