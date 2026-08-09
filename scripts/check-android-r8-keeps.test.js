import { describe, expect, it } from "vitest";
import {
  checkAndroidR8Keeps,
  parseKeptClassNames,
  parseRemovedMembers,
} from "./check-android-r8-keeps.mjs";

// Shaped like the real reports: unindented `original -> obfuscated:` class
// lines, indented member lines beneath them.
const HEALTHY_MAPPING = [
  "com.getcapacitor.Bridge -> com.getcapacitor.Bridge:",
  "    void load() -> load",
  "com.getcapacitor.PluginHandle -> com.getcapacitor.PluginHandle:",
  "com.getcapacitor.annotation.CapacitorPlugin -> com.getcapacitor.annotation.CapacitorPlugin:",
  "com.getcapacitor.annotation.Permission -> com.getcapacitor.annotation.Permission:",
  "com.getcapacitor.annotation.PermissionCallback -> com.getcapacitor.annotation.PermissionCallback:",
  "com.getcapacitor.annotation.ActivityCallback -> com.getcapacitor.annotation.ActivityCallback:",
  "com.leak.tracking.MainActivity -> com.leak.tracking.a:",
].join("\n");

describe("Android R8 keep guard", () => {
  it("passes when the Capacitor runtime came through untouched", () => {
    expect(
      checkAndroidR8Keeps({
        mappingReport: HEALTHY_MAPPING,
        usageReport: "com.leak.tracking.Unused:\n    void dead()\n",
      }),
    ).toEqual([]);
  });

  // The exact shape of the crash: R8 dropped the field, so getPluginAnnotation()
  // folded to null and every permission check threw.
  it("catches the removed plugin annotation field", () => {
    const problems = checkAndroidR8Keeps({
      mappingReport: HEALTHY_MAPPING,
      usageReport: [
        "com.getcapacitor.PluginHandle:",
        "    public com.getcapacitor.annotation.CapacitorPlugin pluginAnnotation",
      ].join("\n"),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("PluginHandle.pluginAnnotation");
    expect(problems[0]).toContain("NullPointerException");
  });

  it("catches a renamed annotation class", () => {
    const problems = checkAndroidR8Keeps({
      mappingReport: HEALTHY_MAPPING.replace(
        "com.getcapacitor.annotation.CapacitorPlugin -> com.getcapacitor.annotation.CapacitorPlugin:",
        "com.getcapacitor.annotation.CapacitorPlugin -> y2.b:",
      ),
      usageReport: "",
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("renamed to y2.b");
  });

  it("catches a class R8 removed outright", () => {
    const problems = checkAndroidR8Keeps({
      mappingReport: HEALTHY_MAPPING.split("\n")
        .filter((line) => !line.startsWith("com.getcapacitor.PluginHandle"))
        .join("\n"),
      usageReport: "",
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("absent from mapping.txt");
  });

  it("attributes members to the class they are indented under", () => {
    const removed = parseRemovedMembers(
      [
        "com.example.First:",
        "    void gone()",
        "com.example.Second:",
        "    int alsoGone",
      ].join("\n"),
    );

    expect(removed.get("com.example.First")).toEqual(["void gone()"]);
    expect(removed.get("com.example.Second")).toEqual(["int alsoGone"]);
  });

  it("reads class lines and ignores member lines when mapping names", () => {
    const kept = parseKeptClassNames(HEALTHY_MAPPING);

    expect(kept.get("com.leak.tracking.MainActivity")).toBe(
      "com.leak.tracking.a",
    );
    expect(kept.has("void load()")).toBe(false);
  });
});
