import { beforeEach, describe, expect, it } from "vitest";
import {
  applyJournalEntries,
  createJournalStore,
  isWorthJournalling,
  WEB_JOURNAL_STORE,
} from "./webProjectJournal";
import { createWebEnvelope, normalizeWebEnvelope } from "./webProjectEnvelope";

describe("web project journal replay", () => {
  it("returns the snapshot untouched when nothing was appended", () => {
    const data = [{ id: "a" }];
    expect(applyJournalEntries(data, [])).toBe(data);
  });

  it("applies upserts and deletions in append order", () => {
    const snapshot = [
      { id: "a", value: 1 },
      { id: "b", value: 1 },
    ];
    const entries = [
      { upserts: [{ id: "a", value: 2 }], deletedIds: [] },
      { upserts: [{ id: "c", value: 1 }], deletedIds: ["b"] },
    ];

    expect(applyJournalEntries(snapshot, entries)).toEqual([
      { id: "a", value: 2 },
      { id: "c", value: 1 },
    ]);
  });

  // The rollback of an interrupted import restores a snapshot taken before it
  // started, so records the import had removed come back carrying their
  // original ids. That is a deletion in one delta and an upsert of the same id
  // in the next, and it used to list the record twice.
  it("keeps a record re-added after a deletion once, where the writer put it", () => {
    const snapshot = [
      { id: "a", value: 1 },
      { id: "b", value: 1 },
    ];
    const entries = [
      { upserts: [], deletedIds: ["a"] },
      { upserts: [{ id: "a", value: 2 }], deletedIds: [] },
    ];

    expect(applyJournalEntries(snapshot, entries)).toEqual([
      { id: "b", value: 1 },
      { id: "a", value: 2 },
    ]);
  });

  it("keeps a record deleted and re-added inside one entry once", () => {
    const snapshot = [{ id: "a", value: 1 }, { id: "b" }];
    const entries = [{ upserts: [{ id: "a", value: 2 }], deletedIds: ["a"] }];

    expect(applyJournalEntries(snapshot, entries)).toEqual([
      { id: "b" },
      { id: "a", value: 2 },
    ]);
  });

  // A delta is written as one record, and a reader has no say in what comes
  // back out of it. An entry that arrived without one of its arrays — an older
  // writer, a partial record — must cost that one delta, not the whole project:
  // throwing here would take down the assembly of an otherwise intact copy.
  it("survives an entry missing either of its arrays", () => {
    const snapshot = [{ id: "a" }, { id: "b" }];

    expect(applyJournalEntries(snapshot, [{ upserts: [{ id: "c" }] }])).toEqual(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
    );
    expect(applyJournalEntries(snapshot, [{ deletedIds: ["a"] }])).toEqual([
      { id: "b" },
    ]);
    expect(applyJournalEntries(snapshot, [{}])).toEqual(snapshot);
  });

  // The metadata describes the assembled state, so a reader that assembles
  // anything other than what the writer held fails the checksum and the copy
  // is discarded. Both the primary and its mirror are written from the same
  // delta, so a mismatch here takes out the backup as well.
  it("assembles what the writer checksummed", () => {
    const snapshot = [
      { id: "a", value: 1 },
      { id: "b", value: 1 },
    ];
    const entries = [
      { upserts: [], deletedIds: ["a"] },
      { upserts: [{ id: "a", value: 2 }], deletedIds: [] },
    ];
    // What the writer held in memory after those two saves.
    const written = createWebEnvelope([
      { id: "b", value: 1 },
      { id: "a", value: 2 },
    ]);

    const assembled = applyJournalEntries(snapshot, entries);
    expect(() =>
      normalizeWebEnvelope({ ...written, data: assembled }, "test"),
    ).not.toThrow();
  });
});

describe("web project journal store", () => {
  const fakeDb = (existing = []) => ({
    objectStoreNames: { contains: (name) => existing.includes(name) },
    createObjectStore: (name, options) => {
      created.push({ name, options });
      return {
        createIndex: (index, keyPath) => indexed.push({ index, keyPath }),
      };
    },
  });
  let created;
  let indexed;
  beforeEach(() => {
    created = [];
    indexed = [];
  });

  it("creates the store with its project index", () => {
    createJournalStore(fakeDb());
    expect(created).toEqual([
      { name: WEB_JOURNAL_STORE, options: { keyPath: ["projectId", "seq"] } },
    ]);
    expect(indexed).toEqual([{ index: "byProject", keyPath: "projectId" }]);
  });

  // Every upgrade of the database runs this, not only the one that introduced
  // the store. Recreating it would throw and take the upgrade with it.
  it("leaves an existing store alone", () => {
    createJournalStore(fakeDb([WEB_JOURNAL_STORE]));
    expect(created).toEqual([]);
  });
});

describe("web project journal compaction threshold", () => {
  const mutationOf = (upserts, deleted = 0) => ({
    upserts: Array.from({ length: upserts }, (_, index) => ({ id: index })),
    deletedIds: Array.from({ length: deleted }, (_, index) => `d${index}`),
  });

  it("declines without a mutation to append", () => {
    expect(isWorthJournalling(null, 10)).toBe(false);
  });

  it("journals an ordinary edit", () => {
    expect(isWorthJournalling(mutationOf(2, 1), 10)).toBe(true);
  });

  it("declines a change too large to be worth replaying", () => {
    expect(isWorthJournalling(mutationOf(200, 51), 10_000)).toBe(false);
  });

  it("declines a change covering much of a large dataset", () => {
    expect(isWorthJournalling(mutationOf(200), 500)).toBe(false);
  });

  it("keeps the ratio rule off small datasets", () => {
    expect(isWorthJournalling(mutationOf(200), 499)).toBe(true);
  });
});
