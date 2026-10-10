import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isNative: false, persisted: false }));

vi.mock("@/utils/platform", () => ({
  get isNative() {
    return state.isNative;
  },
}));
vi.mock("@/app/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: (key) => key }),
}));
vi.mock("@/services/storage/persistentStorage", () => ({
  requestPersistentStorage: vi.fn(async () => ({
    supported: true,
    persisted: state.persisted,
  })),
}));

const { default: StoragePersistenceStatus } =
  await import("./StoragePersistenceStatus");

beforeEach(() => {
  state.isNative = false;
  state.persisted = false;
});

describe("StoragePersistenceStatus", () => {
  // Обе копии в IndexedDB уходят разом, когда браузер чистит сайт; человек
  // должен знать, что браузеру это разрешено.
  it("warns when the browser may evict the data", async () => {
    render(<StoragePersistenceStatus />);
    expect(
      await screen.findByText("settings.storagePersistence.notPersisted"),
    ).toBeInTheDocument();
  });

  it("says so when the storage is persistent", async () => {
    state.persisted = true;
    render(<StoragePersistenceStatus />);
    expect(
      await screen.findByText("settings.storagePersistence.persisted"),
    ).toBeInTheDocument();
  });

  it("stays silent on the device", async () => {
    state.isNative = true;
    const { container } = render(<StoragePersistenceStatus />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
