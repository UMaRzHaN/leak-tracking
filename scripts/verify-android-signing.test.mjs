import { describe, expect, it } from "vitest";
import { validateAndroidReleaseEnvironment } from "./verify-android-signing.mjs";

const VALID_ENV = {
  ANDROID_KEYSTORE_PATH: "/secure/release.jks",
  ANDROID_KEYSTORE_PASSWORD: "store-secret",
  ANDROID_KEY_ALIAS: "release",
  ANDROID_KEY_PASSWORD: "key-secret",
  ANDROID_VERSION_CODE: "42",
  ANDROID_VERSION_NAME: "1.2.3",
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

  it("accepts valid release metadata when the keystore exists", () => {
    expect(
      validateAndroidReleaseEnvironment(VALID_ENV, {
        fileExists: () => true,
      }),
    ).toBeNull();
  });
});
