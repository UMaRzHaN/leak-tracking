import { describe, expect, it } from "vitest";
import { redactDiagnosticValue } from "./logger";

describe("redactDiagnosticValue", () => {
  it("redacts secrets, embedded photos, and precise coordinate pairs", () => {
    const apiKeyLikeValue = `AI${"za"}${"1".repeat(30)}`;
    const value = redactDiagnosticValue(
      `${apiKeyLikeValue} data:image/png;base64,AAAA 41.311111, 69.279777`,
    );

    expect(value).toContain("[redacted-api-key]");
    expect(value).toContain("[redacted-image]");
    expect(value).toContain("[redacted-coordinates]");
    expect(value).not.toContain("41.311111");
  });
});
