import { describe, expect, it } from "vitest";
import {
  checkSignerDigests,
  normalizeCertDigest,
  parseSignerDigests,
  pickReleaseApk,
} from "./verify-android-release-apk.mjs";

const RELEASE_DIGEST =
  "b56e337c377ed17a7534e0c86c055f735446e137be7bc8b83713a8d2a47f1527";
const RELEASE_FINGERPRINT =
  "B5:6E:33:7C:37:7E:D1:7A:75:34:E0:C8:6C:05:5F:73:54:46:E1:37:BE:7B:C8:B8:37:13:A8:D2:A4:7F:15:27";
const OTHER_DIGEST = "0".repeat(64);

const printCerts = (digest) =>
  [
    "Signer #1 certificate DN: CN=Test",
    `Signer #1 certificate SHA-256 digest: ${digest}`,
    "Signer #1 certificate SHA-1 digest: e2f6cd8af280cdf7179899fbd273ead3f85efa1c",
    "Signer #1 certificate MD5 digest: d0a955b92ec692ee919bdeb6513dec84",
  ].join("\n");

describe("normalizeCertDigest", () => {
  it("accepts keytool and apksigner spellings of the same fingerprint", () => {
    expect(normalizeCertDigest(RELEASE_FINGERPRINT)).toBe(RELEASE_DIGEST);
    expect(normalizeCertDigest(RELEASE_DIGEST.toUpperCase())).toBe(
      RELEASE_DIGEST,
    );
  });

  it("rejects SHA-1 and garbage", () => {
    expect(
      normalizeCertDigest("e2f6cd8af280cdf7179899fbd273ead3f85efa1c"),
    ).toBeNull();
    expect(normalizeCertDigest("")).toBeNull();
    expect(normalizeCertDigest(undefined)).toBeNull();
  });
});

describe("parseSignerDigests", () => {
  it("reads only SHA-256 lines of actual signers", () => {
    const output = [
      printCerts(RELEASE_DIGEST),
      `Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${RELEASE_DIGEST}`,
      `Signer #1 in lineage certificate SHA-256 digest: ${OTHER_DIGEST}`,
    ].join("\n");
    expect(parseSignerDigests(output)).toEqual([
      RELEASE_DIGEST,
      RELEASE_DIGEST,
    ]);
  });
});

describe("checkSignerDigests", () => {
  it("passes when the APK carries the expected certificate", () => {
    expect(
      checkSignerDigests(printCerts(RELEASE_DIGEST), RELEASE_FINGERPRINT),
    ).toBeNull();
  });

  it("explains a missing or malformed expected fingerprint", () => {
    expect(checkSignerDigests(printCerts(RELEASE_DIGEST), "")).toContain(
      "ANDROID_SIGNING_CERT_SHA256 is not set",
    );
    expect(checkSignerDigests(printCerts(RELEASE_DIGEST), "abc")).toContain(
      "64 hex digits",
    );
  });

  it("fails on a foreign certificate or an unsigned APK", () => {
    expect(
      checkSignerDigests(printCerts(OTHER_DIGEST), RELEASE_FINGERPRINT),
    ).toContain("unexpected certificate");
    expect(checkSignerDigests("", RELEASE_FINGERPRINT)).toContain("unsigned");
  });
});

describe("pickReleaseApk", () => {
  it("returns the only APK and ignores metadata", () => {
    expect(
      pickReleaseApk([
        "output-metadata.json",
        "baselineProfiles",
        "app-release.apk",
      ]),
    ).toBe("app-release.apk");
  });

  it("refuses to guess between several APKs or none", () => {
    expect(() => pickReleaseApk(["a.apk", "b.apk"])).toThrow("exactly one");
    expect(() => pickReleaseApk(["output-metadata.json"])).toThrow("none");
  });
});
