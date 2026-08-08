import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The sibling publicFileWriter.test.js mocks the native plugin, so it proves
// the JS half is self-consistent and nothing more. Every export in the app
// died on a device because `expectedSize` crossed the bridge as an Integer
// while the plugin read it with PluginCall.getLong, which returns a value only
// for a Long — the key was present, the read produced null, and the whole
// export was rejected as "Unknown export token or missing fileName".
//
// This reads the real plugin sources and guards both halves of that failure:
// the keys the JS sends must be read, and no plugin may read a numeric
// argument through the accessor that cannot see a JavaScript number.

const ANDROID_SOURCE_DIR = path.resolve(
  "android/app/src/main/java/com/leak/tracking",
);
const PLUGIN_SOURCE = path.join(
  ANDROID_SOURCE_DIR,
  "PublicFileWriterPlugin.java",
);
const WRITER_SOURCE = path.resolve("src/services/storage/publicFileWriter.js");

const PLUGIN_SOURCES = [
  "PublicFileWriterPlugin.java",
  "LocalSyncPlugin.java",
  "NativeLeakStoragePlugin.java",
];

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

function parseWriterCalls(source) {
  const calls = [];
  const invocation = /\bPublicFileWriter\.(\w+)\(/g;
  let match;
  while ((match = invocation.exec(source)) !== null) {
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
      for (const entry of objectText.split(",")) {
        // Shorthand ({ token }) and explicit ({ folder: value }) alike.
        const key = entry.match(/^\s*(\w+)\s*$|^\s*(\w+)\s*:/);
        if (key) keys.add(key[1] ?? key[2]);
      }
    }
    calls.push({
      method: match[1],
      keys,
      hasPayload: argumentText.startsWith("{"),
    });
  }
  return calls;
}

const nativeMethods = parseNativeMethods(readFileSync(PLUGIN_SOURCE, "utf8"));
const writerCalls = parseWriterCalls(readFileSync(WRITER_SOURCE, "utf8"));

describe("public file writer JS/native bridge contract", () => {
  it("parses both sides of the bridge", () => {
    // Guards the parsers themselves: a regex that silently stops matching
    // would turn every assertion below into a vacuous pass.
    expect(nativeMethods.size).toBeGreaterThanOrEqual(4);
    expect(writerCalls.length).toBeGreaterThanOrEqual(4);
    expect(nativeMethods.get("commit")).toContain("fileName");
  });

  it("calls only methods the Android plugin implements", () => {
    const missing = [
      ...new Set(
        writerCalls
          .map(({ method }) => method)
          .filter((method) => !nativeMethods.has(method)),
      ),
    ];
    expect(missing).toEqual([]);
  });

  it("sends only payload keys the Android plugin reads", () => {
    const unread = [];
    for (const { method, keys, hasPayload } of writerCalls) {
      if (!hasPayload) continue;
      const nativeKeys = nativeMethods.get(method);
      if (!nativeKeys) continue;
      for (const key of keys) {
        if (!nativeKeys.has(key)) unread.push(`${method}.${key}`);
      }
    }
    expect([...new Set(unread)]).toEqual([]);
  });

  it("never reads a number through an accessor blind to JavaScript numbers", () => {
    // org.json parses every whole number below 2^31 as an Integer, and
    // PluginCall.getLong/getFloat return their default for anything that is
    // not already that exact type. Reading a bridge number with them silently
    // yields null, which is how the export bug reached users.
    const offenders = [];
    for (const fileName of PLUGIN_SOURCES) {
      const source = readFileSync(
        path.join(ANDROID_SOURCE_DIR, fileName),
        "utf8",
      );
      for (const match of source.matchAll(
        /\bcall\.(getLong|getFloat)\(\s*"([^"]+)"/g,
      )) {
        offenders.push(`${fileName}: call.${match[1]}("${match[2]}")`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
