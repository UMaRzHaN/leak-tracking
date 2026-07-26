import { describe, expect, it } from "vitest";
import {
  LEAK_FIELD_VERSIONS_KEY,
  stampLeakFieldVersions,
} from "./leakFieldVersions";

describe("stampLeakFieldVersions", () => {
  it("seeds legacy fields and advances only locally changed fields", () => {
    const previous = [
      {
        id: "one",
        status: "open",
        component: "Valve",
        updatedAt: 100,
      },
    ];
    const next = [
      {
        ...previous[0],
        status: "resolved",
        updatedAt: 200,
      },
    ];

    const [versioned] = stampLeakFieldVersions(previous, next, 300);

    expect(versioned[LEAK_FIELD_VERSIONS_KEY]).toMatchObject({
      status: 300,
      component: 100,
    });
  });

  it("keeps an incoming field clock instead of replacing it with local save time", () => {
    const previous = [
      {
        id: "one",
        note: "old",
        updatedAt: 100,
        [LEAK_FIELD_VERSIONS_KEY]: { note: 100 },
      },
    ];
    const next = [
      {
        id: "one",
        note: "peer edit",
        updatedAt: 400,
        [LEAK_FIELD_VERSIONS_KEY]: { note: 400 },
      },
    ];

    const [versioned] = stampLeakFieldVersions(previous, next, 500);

    expect(versioned[LEAK_FIELD_VERSIONS_KEY].note).toBe(400);
  });

  it("records deletion of an optional field", () => {
    const previous = [
      {
        id: "one",
        photo: "idb://old",
        updatedAt: 100,
        [LEAK_FIELD_VERSIONS_KEY]: { photo: 100 },
      },
    ];
    const next = [{ id: "one", updatedAt: 200 }];

    const [versioned] = stampLeakFieldVersions(previous, next, 250);

    expect(versioned.photo).toBeUndefined();
    expect(versioned[LEAK_FIELD_VERSIONS_KEY].photo).toBe(250);
  });
});
