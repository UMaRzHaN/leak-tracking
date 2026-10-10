import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  activeProject: null,
}));

vi.mock("@/repositories/ComponentRepository", () => ({
  ComponentRepository: { load: mocks.load, save: mocks.save },
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: mocks.activeProject }),
}));

const { ComponentRegistryProvider, useComponentRegistryStore } =
  await import("./ComponentRegistryContext");
const { notifyComponentRegistryChanged } =
  await import("@/repositories/componentRegistrySignal");

const upstream = { id: "p1", type: "upstream", folderName: "buzahur" };
const otherUpstream = { id: "p2", type: "upstream", folderName: "messoyaha" };
// Реестр ведут все три типа проекта, поэтому «без реестра» — это тип,
// которого в конфигурации нет вовсе.
const withoutRegistry = { id: "p3", type: "unknown", folderName: "none" };

function mount(useSubject = () => useComponentRegistryStore()) {
  return renderHook(useSubject, { wrapper: ComponentRegistryProvider });
}

describe("ComponentRegistryProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeProject = upstream;
    mocks.load.mockResolvedValue([{ id: "a", component_uid: "1" }]);
    mocks.save.mockImplementation(async (_project, list) => list);
  });

  it("не читает хранилище, пока список никому не нужен", async () => {
    // Реестр — это тысячи карточек. Сессия, которая его не открывает, не
    // должна за него платить ничем.
    mount(() => useComponentRegistryStore({ active: false }));

    await act(async () => {});
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("читает один раз на всех читателей", async () => {
    // Ради этого всё и затевалось: экран реестра и выбор места в шапке
    // открываются вместе и читали хранилище порознь.
    const { result } = mount(() => [
      useComponentRegistryStore(),
      useComponentRegistryStore(),
    ]);

    await waitFor(() => expect(result.current[0].components).toHaveLength(1));
    expect(result.current[1].components).toBe(result.current[0].components);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("молчит для типа проекта без реестра", async () => {
    mocks.activeProject = withoutRegistry;
    const { result } = mount();

    await act(async () => {});
    expect(result.current.enabled).toBe(false);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("перечитывает после записи, сделанной мимо него", async () => {
    // Архив инвентаризации и импорт проекта пишут карточки сами; без этого
    // экран показывал бы список, прочитанный до импорта.
    const { result } = mount();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));

    mocks.load.mockResolvedValue([
      { id: "a", component_uid: "1" },
      { id: "b", component_uid: "2" },
    ]);
    act(() => notifyComponentRegistryChanged());

    await waitFor(() => expect(result.current.components).toHaveLength(2));
  });

  it("не читает по чужому сигналу, пока список никому не нужен", async () => {
    mount(() => useComponentRegistryStore({ active: false }));

    act(() => notifyComponentRegistryChanged());
    await act(async () => {});

    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("сбрасывает список при смене проекта, а не показывает чужой", async () => {
    function Reader({ onState }) {
      onState(useComponentRegistryStore());
      return null;
    }
    let latest = null;
    const view = render(
      <ComponentRegistryProvider>
        <Reader
          onState={(state) => {
            latest = state;
          }}
        />
      </ComponentRegistryProvider>,
    );
    await waitFor(() => expect(latest.components).toHaveLength(1));

    mocks.load.mockImplementation(() => new Promise(() => {}));
    mocks.activeProject = otherUpstream;
    view.rerender(
      <ComponentRegistryProvider>
        <Reader
          onState={(state) => {
            latest = state;
          }}
        />
      </ComponentRegistryProvider>,
    );

    // Карточки прежнего проекта уходят немедленно: показать чужое железо
    // хуже, чем не показать никакого.
    await waitFor(() => expect(latest.components).toEqual([]));
  });

  it("сообщает об отказе хранилища, а не показывает пустой реестр", async () => {
    mocks.load.mockRejectedValue(new Error("storage gone"));
    const { result } = mount();

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(false);
    expect(result.current.components).toEqual([]);
    expect(result.current.loaded).toBe(false);
  });

  it("отличает непрочитанный реестр от пустого", async () => {
    // Пустой список до прочтения — «ещё не знаю», а не «карточек нет»:
    // остаток сверки по нему вышел бы нулём.
    mocks.load.mockResolvedValue([]);
    const { result } = mount();
    expect(result.current.loaded).toBe(false);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.components).toEqual([]);
  });

  it("запись, начатая до конца чтения, считается от прочитанного", async () => {
    // Экран реестра даёт завести карточку, пока список ещё грузится. Запись
    // считалась от пустого списка и заменяла весь обход одной карточкой.
    /** @type {(list: any[]) => void} */
    let finishLoad = () => {};
    mocks.load.mockImplementationOnce(
      () => new Promise((resolve) => (finishLoad = resolve)),
    );
    const { result } = mount();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));

    let written;
    await act(async () => {
      written = result.current.persist((current) => [
        ...current,
        { id: "new", component_uid: "2" },
      ]);
      // Чтение заканчивается заметно позже, чем запись встала в очередь.
      await new Promise((resolve) => setTimeout(resolve, 20));
      finishLoad([{ id: "a", component_uid: "1" }]);
      await written;
    });

    const [, list, options] = mocks.save.mock.calls[0];
    expect(list.map((card) => card.id)).toEqual(["a", "new"]);
    expect(options.previous.map((card) => card.id)).toEqual(["a"]);
  });

  it("после отказа чтения не пишет вслепую поверх реестра", async () => {
    // Сорвавшееся чтение оставляло пустой список, а экран всё равно давал
    // сохранить карточку — и весь реестр заменялся ею одной.
    mocks.load.mockRejectedValue(new Error("storage gone"));
    const { result } = mount();
    await waitFor(() => expect(result.current.error).toBeTruthy());

    await expect(
      result.current.persist((current) => [
        ...current,
        { id: "new", component_uid: "2" },
      ]),
    ).rejects.toThrow("storage gone");
    expect(mocks.save).not.toHaveBeenCalled();

    // Хранилище ожило — запись строится на том, что в нём лежит.
    mocks.load.mockResolvedValue([{ id: "a", component_uid: "1" }]);
    await act(async () => {
      await result.current.persist((current) => [
        ...current,
        { id: "new", component_uid: "2" },
      ]);
    });
    expect(mocks.save.mock.calls[0][1].map((card) => card.id)).toEqual([
      "a",
      "new",
    ]);
  });

  it("требует провайдера, а не отвечает пустым списком", () => {
    // Забытый провайдер — это ненайденный реестр на экране, где он есть.
    // Тихий пустой список превратил бы поломку в «карточек нет».
    expect(() => renderHook(() => useComponentRegistryStore())).toThrow(
      /ComponentRegistryProvider/,
    );
  });
});
