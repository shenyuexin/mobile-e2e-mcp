---
phase: 06-developer-facing-skill-roadmap
plan: 08
verify_type: internal-implementation
verified_on: 2026-03-28
---

# Phase 06 Plan 08 Verify

## Verification Scope

Confirm that the canonical Android real skill source exists and preserves the A2 publication-grade behavior.

## Commands

```bash
pnpm exec tsx -e "const fs=require('fs'); const skill='skills/android-e2e-readiness/SKILL.md'; console.log(skill, fs.existsSync(skill)); const text=fs.readFileSync(skill,'utf8'); console.log(text.includes('name: android-e2e-readiness')); console.log(text.includes('extends')); console.log(text.includes('Entry / reset')); console.log(text.includes('Hybrid')); console.log(text.includes('Do not start with “just add more Compose waits.”'));"
```

## Result

- ✅ Canonical Android real skill source exists in the repo.
- ✅ The skill stays layered under the baseline and targets Android-specific misdiagnosis patterns.
