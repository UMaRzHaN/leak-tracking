import { describe, expect, it } from "vitest";
import { getPhotoPathContentHash } from "./photoContentHash";

const HASH = "a".repeat(64);

describe("getPhotoPathContentHash", () => {
  it("reads the hash from a web photo key", () => {
    expect(getPhotoPathContentHash(`idb://photo_p1_leak-1_h_${HASH}`)).toBe(
      HASH,
    );
  });

  it("reads the hash from a native photo path", () => {
    expect(
      getPhotoPathContentHash(
        `data://LeakReports/site/photos/photo_leak-1_h_${HASH}.jpg`,
      ),
    ).toBe(HASH);
  });

  it("accepts the shorter fallback fingerprint", () => {
    const short = "b".repeat(24);
    expect(getPhotoPathContentHash(`idb://photo_p1_leak-1_h_${short}`)).toBe(
      short,
    );
  });

  it("returns null for a timestamp-versioned photo", () => {
    expect(getPhotoPathContentHash("idb://photo_p1_leak-1_1755772800000")).toBe(
      null,
    );
    expect(
      getPhotoPathContentHash(
        "data://LeakReports/site/photos/photo_leak-1_1755772800000_2.jpg",
      ),
    ).toBe(null);
  });

  it("returns null for anything that is not a stored photo path", () => {
    expect(getPhotoPathContentHash(null)).toBe(null);
    expect(getPhotoPathContentHash(new Blob(["photo"]))).toBe(null);
    expect(getPhotoPathContentHash("data:image/jpeg;base64,AAAA")).toBe(null);
    expect(getPhotoPathContentHash(`idb://photo_p1_leak-1_h_${HASH}x`)).toBe(
      null,
    );
    expect(getPhotoPathContentHash("idb://photo_p1_leak-1_h_ZZZZ")).toBe(null);
  });
});
