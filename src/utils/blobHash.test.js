import { describe, expect, it, vi } from "vitest";
import { fingerprintBlob } from "./blobHash";

describe("fingerprintBlob", () => {
  it("returns the same fingerprint for equal bytes", async () => {
    const left = await fingerprintBlob(new Blob(["same"]));
    const right = await fingerprintBlob(new Blob(["same"]));
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{24,64}$/);
  });

  it("uses a deterministic fallback without SubtleCrypto", async () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", {});
    try {
      await expect(fingerprintBlob(new Blob(["fallback"]))).resolves.toMatch(
        /^[a-f0-9]{24}$/,
      );
    } finally {
      vi.stubGlobal("crypto", original);
    }
  });
});
