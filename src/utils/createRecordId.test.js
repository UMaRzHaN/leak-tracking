import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordId } from "./createRecordId";

describe("createRecordId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the platform UUID generator when available", () => {
    const randomUUID = vi.fn(() => "123e4567-e89b-42d3-a456-426614174000");
    vi.stubGlobal("crypto", { randomUUID });

    expect(createRecordId()).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates an RFC 4122 version 4 UUID from secure random bytes", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      },
    });

    expect(createRecordId()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("fails closed when secure randomness is unavailable", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() => createRecordId()).toThrow(
      "Secure random ID generation is unavailable",
    );
  });
});
