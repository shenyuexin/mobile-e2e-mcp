# Phase 06 Plan 05 Loophole Register

Record every meaningful loophole exposed during pressure testing.

| ID | Skill lane | Scenario | Loophole observed | Why it matters | Proposed fix | Status |
|---|---|---|---|---|---|---|
| L-001 | [baseline/android/ios] | [scenario id] | [exact issue] | [risk] | [draft change] | open |
| L-002 | baseline | A-RED-01 | The unguided assistant still produced a reasonably good readiness answer, so the scenario did not force a strong enough RED failure. | If RED is too weak, the baseline draft may appear less necessary than it really is and publication gates become unreliable. | Add stronger authority pressure, higher ambiguity, and evidence-interpretation demands so the scenario differentiates ad hoc advice from baseline-contract reasoning. | open |
| L-003 | android | B-01 | The first Android prompt already exposed Compose, Views, hybrid, and retries, so the unguided assistant reached much of the intended answer without the draft. | If Android RED scenarios leak the diagnosis, the draft’s unique value is under-measured. | Add Android scenarios that force evidence interpretation, hybrid ownership ambiguity, or pressure to over-fit on Compose only. | open |
| L-004 | ios | C-01 | The first iOS prompt already exposed accessibility identifiers, mixed surfaces, and interruption problems, so the unguided assistant reached much of the intended answer without the draft. | If iOS RED scenarios leak the diagnosis, the draft’s unique value is under-measured. | Add iOS scenarios that stress launch/reset ambiguity, interruption attribution, or pressure to over-index on SwiftUI. | open |
| L-005 | android | B-02 | Even the harder Android prompt still let the unguided assistant avoid a strong Compose-only misclassification. | The Android draft currently proves structural value more than unique corrective value under pressure. | Create a scenario with misleading evidence, weaker hybrid clues, and stronger pressure to choose synchronization-only remediation. | closed via A2 |
| L-006 | ios | C-02 | Even the harder iOS prompt still let the unguided assistant avoid a strong SwiftUI-only misclassification. | The iOS draft currently proves structural value more than unique corrective value under pressure. | Create a scenario with under-specified launch/reset and interruption evidence so the draft has to rescue the diagnosis more clearly. | closed via I1 |

## Usage Rules

1. Capture the loophole in concrete language.
2. Record whether it is a trigger problem, wording problem, scope problem, or structural problem.
3. Do not close an entry until the draft has been updated and re-tested.
