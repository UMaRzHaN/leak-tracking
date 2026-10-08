import { describe, expect, it } from "vitest";
import { validateAndroidReleaseEnvironment } from "./verify-android-signing.mjs";

const VALID_ENV = {
  ANDROID_KEYSTORE_PATH: "/secure/release.jks",
  ANDROID_KEYSTORE_PASSWORD: "store-secret",
  ANDROID_KEY_ALIAS: "release",
  ANDROID_KEY_PASSWORD: "key-secret",
  ANDROID_VERSION_CODE: "42",
  ANDROID_VERSION_NAME: "1.2.3",
  ANDROID_SIGNING_CERT_SHA256:
    "B5:6E:33:7C:37:7E:D1:7A:75:34:E0:C8:6C:05:5F:73:54:46:E1:37:BE:7B:C8:B8:37:13:A8:D2:A4:7F:15:27",
};

describe("validateAndroidReleaseEnvironment", () => {
  it("requires explicit version metadata as well as signing credentials", () => {
    const env = { ...VALID_ENV };
    delete env.ANDROID_VERSION_CODE;
    delete env.ANDROID_VERSION_NAME;

    expect(
      validateAndroidReleaseEnvironment(env, { fileExists: () => true }),
    ).toContain("ANDROID_VERSION_CODE, ANDROID_VERSION_NAME");
  });

  it("rejects invalid or non-incrementing-compatible version codes", () => {
    expect(
      validateAndroidReleaseEnvironment(
        { ...VALID_ENV, ANDROID_VERSION_CODE: "0" },
        { fileExists: () => true },
      ),
    ).toContain("positive integer");
    expect(
      validateAndroidReleaseEnvironment(
        { ...VALID_ENV, ANDROID_VERSION_CODE: "1.5" },
        { fileExists: () => true },
      ),
    ).toContain("positive integer");
  });

  it("requires the expected certificate fingerprint before building", () => {
    const env = { ...VALID_ENV };
    delete env.ANDROID_SIGNING_CERT_SHA256;
    expect(
      validateAndroidReleaseEnvironment(env, { fileExists: () => true }),
    ).toContain("ANDROID_SIGNING_CERT_SHA256");
    expect(
      validateAndroidReleaseEnvironment(
        { ...VALID_ENV, ANDROID_SIGNING_CERT_SHA256: "e2:f6:cd" },
        { fileExists: () => true },
      ),
    ).toContain("64 hex digits");
  });

  it("rejects a relative keystore path that Gradle would resolve elsewhere", () => {
    expect(
      validateAndroidReleaseEnvironment(
        { ...VALID_ENV, ANDROID_KEYSTORE_PATH: "keys/release.jks" },
        { fileExists: () => true },
      ),
    ).toContain("must be absolute");
  });

  it("accepts valid release metadata when the keystore exists", () => {
    expect(
      validateAndroidReleaseEnvironment(VALID_ENV, {
        fileExists: () => true,
      }),
    ).toBeNull();
  });
});
