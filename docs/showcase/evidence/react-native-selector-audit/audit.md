## React Native selector audit

Verdict: `selector_contract_satisfied`
Run ID: `react-native-selector-audit-2026-06-01`
Source roots: `docs/showcase/fixtures/react-native-login`
Declared selectors: `login-screen`, `phone-input`, `password-input`, `login-button`

Matches:
- login-screen: `testID` in `docs/showcase/fixtures/react-native-login/App.tsx.template:39`
- phone-input: `testID` in `docs/showcase/fixtures/react-native-login/App.tsx.template:44`
- password-input: `testID` in `docs/showcase/fixtures/react-native-login/App.tsx.template:53`
- login-button: `testID` in `docs/showcase/fixtures/react-native-login/App.tsx.template:68`

Missing selectors:
- none

Duplicate selectors:
- none

Blockers:
- none

Boundaries:
- This audit is static source evidence; it does not prove the selector is visible at runtime.
- Only literal testID/accessibilityLabel/accessibilityHint values are counted in this phase.
- Device UI hierarchy confirmation still belongs to live verification and intake evidence.
