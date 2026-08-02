import { describe, expect, it } from "vitest";
import { requireHistoryUser } from "./historyUser";

describe("requireHistoryUser", () => {
  it("trims and returns a valid user name", () => {
    expect(requireHistoryUser("  Inspector  ")).toBe("Inspector");
  });

  it.each([undefined, null, "", "   "])(
    "rejects an empty history user: %s",
    (value) => {
      expect(() => requireHistoryUser(value)).toThrowError(
        expect.objectContaining({ code: "HISTORY_USER_REQUIRED" }),
      );
    },
  );
});
