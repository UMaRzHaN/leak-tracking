import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every other sync test mocks the native plugin, and a mock implements whatever
// the JS half happens to call — so a method or payload key that does not exist
// on the Android side passes the whole suite and fails only on a device. This
// reads the actual plugin source and compares the two sides of the bridge.
//
// Capacitor delivers an unknown method as a rejected call and an unknown key as
// a silent null, so both failure modes look like an empty result at runtime
// rather than an error pointing at the typo.

const PLUGIN_SOURCE = path.resolve(
  "android/app/src/main/java/com/leak/tracking/LocalSyncPlugin.java",
);
const SERVICE_SOURCE = path.resolve("src/services/sync/localSyncService.js");

// Provided by Capacitor's Plugin base class, not by this plugin.
const INHERITED_METHODS = new Set(["addListener", "removeAllListeners"]);

function readMatchingBlock(source, openIndex, open, close) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  throw new Error(`Unbalanced ${open}${close} starting at ${openIndex}`);
}

function parseNativeMethods(source) {
  const methods = new Map();
  const signature =
    /@PluginMethod[\s\S]{0,80}?public void (\w+)\(PluginCall \w+\)\s*\{/g;
  let match;
  while ((match = signature.exec(source)) !== null) {
    const bodyStart = source.indexOf("{", match.index + match[0].length - 1);
    const body = readMatchingBlock(source, bodyStart, "{", "}");
    // Two shapes count as reading a key: the typed accessors
    // (call.getString("x")) and a raw read off the payload
    // (call.getData().opt("x")), which numeric arguments need because
    // PluginCall.getLong only accepts a Long and org.json hands back an
    // Integer for anything below 2^31.
    const keys = new Set(
      [
        ...body.matchAll(
          /\bcall\.getData\(\)\.\w+\(\s*"([^"]+)"|\bcall\.get\w+\(\s*"([^"]+)"/g,
        ),
      ].map((keyMatch) => keyMatch[1] ?? keyMatch[2]),
    );
    methods.set(match[1], keys);
  }
  return methods;
}

function parseServiceCalls(source) {
  const calls = [];
  const invocation = /\bLocalSync\.(\w+)\(/g;
  let match;
  while ((match = invocation.exec(source)) !== null) {
    const method = match[1];
    if (INHERITED_METHODS.has(method)) continue;
    const parenIndex = invocation.lastIndex - 1;
    const argumentText = readMatchingBlock(source, parenIndex, "(", ")").trim();
    const keys = new Set();
    if (argumentText.startsWith("{")) {
      const objectText = readMatchingBlock(
        argumentText,
        argumentText.indexOf("{"),
        "{",
        "}",
      );
      // Top-level keys only: a nested object belongs to a value, not to the
      // payload the plugin reads.
      let depth = 0;
      let pending = "";
      for (const character of objectText) {
        if (character === "{" || character === "[" || character === "(") {
          depth += 1;
        } else if (
          character === "}" ||
          character === "]" ||
          character === ")"
        ) {
          depth -= 1;
        }
        if (depth === 0 && character === ",") {
          pending += "\n";
          continue;
        }
        pending += character;
      }
      for (const line of pending.split("\n")) {
        const key = line.match(/^\s*(\w+)\s*[:,]?\s*$|^\s*(\w+)\s*:/);
        if (key) keys.add(key[1] ?? key[2]);
      }
    }
    calls.push({ method, keys, hasPayload: argumentText.startsWith("{") });
  }
  return calls;
}

const nativeMethods = parseNativeMethods(readFileSync(PLUGIN_SOURCE, "utf8"));
const serviceCalls = parseServiceCalls(readFileSync(SERVICE_SOURCE, "utf8"));

describe("local sync JS/native bridge contract", () => {
  it("parses both sides of the bridge", () => {
    // Guards the parsers themselves: a regex that silently stops matching
    // would turn every assertion below into a vacuous pass.
    expect(nativeMethods.size).toBeGreaterThanOrEqual(9);
    expect(serviceCalls.length).toBeGreaterThanOrEqual(9);
    expect(nativeMethods.get("exchange")).toContain("fingerprint");
  });

  it("calls only methods the Android plugin implements", () => {
    const missing = [
      ...new Set(
        serviceCalls
          .map(({ method }) => method)
          .filter((method) => !nativeMethods.has(method)),
      ),
    ];
    expect(missing).toEqual([]);
  });

  it("sends only payload keys the Android plugin reads", () => {
    const unread = [];
    for (const { method, keys, hasPayload } of serviceCalls) {
      if (!hasPayload) continue;
      const nativeKeys = nativeMethods.get(method);
      if (!nativeKeys) continue;
      for (const key of keys) {
        if (!nativeKeys.has(key)) unread.push(`${method}.${key}`);
      }
    }
    expect([...new Set(unread)]).toEqual([]);
  });
});
