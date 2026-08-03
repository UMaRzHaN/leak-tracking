import { describe, expect, it } from "vitest";
import { localSyncErrorText } from "./localSyncErrorText";

// Stands in for i18next: knows two keys, echoes anything else back the way
// i18next does for a missing key.
const t = (key) =>
  ({
    "syncErrors.INVALID_CODE": "Wrong connection code",
    "syncErrors.SESSION_EXPIRED": "The QR code has expired",
  })[key] ?? key;

describe("localSyncErrorText", () => {
  it("translates a code the plugin reported", () => {
    const error = Object.assign(new Error("Неверный код подключения"), {
      code: "INVALID_CODE",
    });
    expect(localSyncErrorText(error, t)).toBe("Wrong connection code");
  });

  // A peer running a build from before the codes existed sends only text.
  it("falls back to the plugin message when there is no code", () => {
    const error = new Error("Архив повреждён при передаче");
    expect(localSyncErrorText(error, t)).toBe("Архив повреждён при передаче");
  });

  // A newer peer may name a failure this build has no translation for.
  it("falls back to the message for an unknown code", () => {
    const error = Object.assign(new Error("Что-то новое"), {
      code: "SOMETHING_NEWER",
    });
    expect(localSyncErrorText(error, t)).toBe("Что-то новое");
  });

  it("uses the code itself when neither a translation nor a message exists", () => {
    expect(localSyncErrorText({ code: "SOMETHING_NEWER" }, t)).toBe(
      "SOMETHING_NEWER",
    );
  });

  it("survives a failure with nothing on it", () => {
    expect(localSyncErrorText(null, t)).toBe("");
  });
});
