import { describe, expect, it } from "vitest";
import { withPortablePhotoValues } from "./photoValues";

describe("withPortablePhotoValues", () => {
  it("turns a Blob left in place of a path into a data URI and drops other junk", async () => {
    // Так выглядела запись после импорта Excel: у события вместо пути лежал
    // сам Blob, а на телефоне после JSON — пустой объект.
    const repair = { id: "e-2", type: "repair_started", photo: "idb://repair" };
    const leak = {
      id: "leak-1",
      photo: "idb://before",
      monitoringRecords: [{ id: "r-1", photo: {} }],
      events: [
        {
          id: "e-1",
          type: "inspection",
          photo: new Blob(["round"], { type: "image/jpeg" }),
        },
        repair,
      ],
    };

    const [portable] = await withPortablePhotoValues([leak]);

    expect(portable.photo).toBe("idb://before");
    expect(portable.monitoringRecords[0]).not.toHaveProperty("photo");
    expect(portable.events[0].photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(portable.events[1]).toBe(repair);
    expect(leak.events[0].photo).toBeInstanceOf(Blob);
  });

  it("drops a Blob that is not an image", async () => {
    const [portable] = await withPortablePhotoValues([
      { id: "leak-1", photo_after: new Blob(["text"], { type: "text/plain" }) },
    ]);

    expect(portable).not.toHaveProperty("photo_after");
  });

  it("returns leaks without junk as the same objects", async () => {
    const leaks = [
      {
        id: "leak-1",
        photo: "idb://before",
        events: [{ id: "e-1", type: "inspection", photo: "idb://round" }],
      },
      null,
    ];

    const result = await withPortablePhotoValues(leaks);

    expect(result[0]).toBe(leaks[0]);
    expect(result[1]).toBeNull();
  });
});
