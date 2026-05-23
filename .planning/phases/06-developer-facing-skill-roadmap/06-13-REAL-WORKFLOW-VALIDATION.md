# Phase 06 Plan 13 Real-Workflow Validation Pack

## Purpose

This pack closes the remaining verification gap for the first-wave skills: repeatable, repo-derived, messy developer prompts that test usefulness beyond author-shaped pressure cards.

Seed sources:

- `docs/showcase/failure-intelligence-demo.md`
- `docs/showcase/README.md`
- `docs/showcase/demo-playbook.zh-CN.md`
- `docs/showcase/ios-recording-showcase.md`
- `docs/templates/bug-packet-template.md`

## Success Standard

For each skill lane, the guided answer should:

1. identify the most likely gap more usefully than a naïve control answer,
2. tell the developer what evidence to collect next,
3. tell the developer what to fix first,
4. say when to hand off or switch layers.

## Baseline Scenarios

### B-RW-01 — visible but no-op across platforms
Source inspiration: failure-intelligence demo + bug packet template

```text
We only have a bug packet: both Android and iOS sometimes land on the right screen, the control is visible, the tap does nothing, and a retry sometimes passes. The team keeps arguing whether this is just flaky automation. What is the most likely gap, what evidence should we collect next, and what should we fix first?
```

### B-RW-02 — interruption false positive / wrong layer blame
Source inspiration: failure-intelligence demo

```text
One report says the action failed because the harness thought the app was interrupted, but the screen looked normal to the team. Another run later passed. We need a short answer: what layer is most suspicious, what evidence should we pull next, and what should we change before adding retries?
```

### B-RW-03 — product flow incomplete vs flaky E2E
Source inspiration: demo playbook + bug packet template

```text
The team says the product details screen “sometimes fails,” but another note says that part of the flow may not even be implemented yet. The run still looks flaky because the app gets to a screen and then progress stops. What should we diagnose first, what evidence is missing, and what should the team verify before blaming the harness?
```

## Android Scenarios

### A-RW-01 — hybrid ownership ambiguity
Source inspiration: Android real-device demos + prior A2 anchor

```text
On Android, the flow reaches the right screen, Compose content is visible, but the action target sometimes does nothing. Hybrid screens are consistently worse than pure screens. We only have one screenshot and a note that retries later pass. What is the most likely Android gap, what should we inspect next, and what should the team change first?
```

### A-RW-02 — device-specific blocker vs timing
Source inspiration: showcase/device variability + bug packet template

```text
One Android device is much flakier than the others. The UI looks right, but taps sometimes don’t work until a later retry. The team wants to standardize on longer waits. What should we check first, what evidence would prove it, and what should we change before tuning waits?
```

### A-RW-03 — entry/reset instability disguised as selector issue
Source inspiration: deterministic-entry planning + bug packet template

```text
Android failures often happen after the app appears to land on the correct screen. Engineers are split between “weak selector” and “timing issue,” but restarting the flow often makes it pass. What is the most likely Android-specific contract gap, what should we inspect next, and what fix comes before retries or selector tweaks?
```

## iOS Scenarios

### I-RW-01 — mixed SwiftUI/UIKit ownership ambiguity
Source inspiration: I1 anchor + iOS recording showcase

```text
On iOS, the screen looks correct and the control is visible, but taps sometimes do nothing. Mixed screens are worse than pure SwiftUI ones, and a later retry can pass. What is the most likely iOS gap, what should we inspect next, and what should the team change before adding more waits?
```

### I-RW-02 — interruption / modal ambiguity
Source inspiration: failure-intelligence style interruption ambiguity + bug packet template

```text
The iOS run sometimes looks normal in screenshots, but someone suspects a permission or modal interruption may have been involved because retries later pass. The team keeps blaming SwiftUI timing. What should we diagnose first, what evidence do we need next, and what should be fixed before tuning waits?
```

### I-RW-03 — launch/reset ambiguity disguised as interaction flake
Source inspiration: launch/reset planning + bug packet template

```text
iOS usually reaches what looks like the right screen, but some runs still fail on the main action and a retry later passes. The team is debating selectors vs timing. What is the most likely iOS-specific contract gap, what should we check next, and what should be fixed first?
```

## Control Runs

Run one unguided control for the hardest scenario in each lane:

- baseline: `B-RW-02`
- android: `A-RW-01`
- ios: `I-RW-02`

The goal is not a broad benchmark. The goal is proving that the skill changes the quality of the next-action diagnosis on a messy, repo-derived prompt.
