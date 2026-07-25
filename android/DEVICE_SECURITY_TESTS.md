# Android device security tests

Open the `android` directory in Android Studio and select a physical device or AVD. Run `AndroidSecurityInstrumentedTest` from `app/src/androidTest/java/com/leak/tracking/AndroidSecurityInstrumentedTest.java`.

The suite verifies camera, microphone, and location runtime permissions; disabled cleartext traffic; optional camera hardware; TLS identity creation in Android Keystore; rejection of truncated Wi-Fi sync transfers; and native Capacitor file operations.

For an OEM test, connect the phone with USB debugging enabled and run:

```text
./gradlew :app:connectedDebugAndroidTest :app:lintDebug :app:testDebugUnitTest
```

Use two physical phones on the same isolated Wi-Fi network for the final end-to-end sync check. Transfer a project in both directions, then repeat while disabling Wi-Fi halfway through. The interrupted import must report an error and must not replace the last valid project archive.

Reports:

- `app/build/reports/androidTests/connected/debug/index.html`
- `app/build/reports/lint-results-debug.html`
- `app/build/reports/tests/testDebugUnitTest/index.html`
