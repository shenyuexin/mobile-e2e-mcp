# Self-Healing Review Prompt

Given a failed mobile E2E sample run, review the bug packet and answer:

1. Was the failure caused by environment, interruption, selector, or app logic?
2. Is a deterministic fix possible without OCR/CV?
3. Should the fix be applied to flow, interruption policy, harness contract, or app instrumentation?
4. What evidence supports the recommendation?
