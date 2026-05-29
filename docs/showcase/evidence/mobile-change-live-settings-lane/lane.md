## Mobile change live Settings lane

Platform: `android`
App: `com.android.settings`
Device: `10AEA40Z3Y000R5`
Run ID: `android-settings-live-success-2026-05-29`

Command:
- `M2E_DEVICE_ID=10AEA40Z3Y000R5 M2E_LIVE_MOBILE_CHANGE_RUN_ID=android-settings-live-success-2026-05-29 M2E_LIVE_MOBILE_CHANGE_APP_ID=com.android.settings M2E_LIVE_MOBILE_CHANGE_POLICY_PROFILE=interactive M2E_LIVE_MOBILE_CHANGE_RUNNER_PROFILE=native_android pnpm run proof:mobile-change-verification:live`

Intake:
- `pnpm run intake:mobile-change-live-proof -- output/showcase/mobile-change-verification-live/android-settings-live-success-2026-05-29`

Success criteria:
- Device discovery succeeds for the requested Android device.
- The governed session starts under the interactive policy profile.
- The Android Settings app launches without requiring an APK build or install.
- UI inspection and screen-summary collection succeed.
- The verification bundle verdict is mobile_change_verified.

Boundaries:
- This lane targets Android Settings as a built-in app so the success path does not depend on a repo-built APK.
- No APK build or install is required.
- The lane is a runnable proof recipe. It does not claim live success until the command is executed and the resulting bundle passes intake.
- For app-under-test claims, replace the appId and add a deterministic readiness contract backed by app evidence.
