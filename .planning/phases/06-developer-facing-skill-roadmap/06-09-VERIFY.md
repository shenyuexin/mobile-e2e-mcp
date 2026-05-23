---
phase: 06-developer-facing-skill-roadmap
plan: 09
verify_type: internal-implementation
verified_on: 2026-03-28
---

# Phase 06 Plan 09 Verify

## Verification Scope

Confirm that the canonical iOS real skill source exists and preserves the I1 publication-grade behavior.

## Commands

```bash
pnpm exec tsx -e "const fs=require('fs'); const skill='skills/ios-e2e-readiness/SKILL.md'; console.log(skill, fs.existsSync(skill)); const text=fs.readFileSync(skill,'utf8'); console.log(text.includes('name: ios-e2e-readiness')); console.log(text.includes('extends')); console.log(text.includes('Launch / reset')); console.log(text.includes('Mixed')); console.log(text.includes('Do not start with “just add more waits around SwiftUI.”'));"
```

## Result

- ✅ Canonical iOS real skill source exists in the repo.
- ✅ The skill stays layered under the baseline and targets iOS-specific misdiagnosis patterns.
