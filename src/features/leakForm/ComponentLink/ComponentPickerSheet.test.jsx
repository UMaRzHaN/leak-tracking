import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  return englishLanguageHook();
});

const ComponentPickerSheet = (await import("./ComponentPickerSheet")).default;
const { componentRegistryWrapper } = await import("@/test/componentRegistry");

// Лист берёт список у провайдера, поэтому здесь он просто подставляется:
// проверяется порядок, поиск и выбор, а не то, как список читается с диска.
let registry = { components: [] };
// Обходчик стоит здесь; расстояния ниже отмерены от этой точки.
const here = { lat: 55.0, lng: 73.0 };

const card = (overrides) => ({
  id: overrides.component_uid,
  component: "Кран шаровой",
  scheme_tag: "V-1",
  location: "Куст 3",
  lat: null,
  lng: null,
  ...overrides,
});

const near = card({ component_uid: "1", lat: 55.0002, lng: 73.0 }); // ~22 м
const mid = card({ component_uid: "2", lat: 55.004, lng: 73.0 }); // ~445 м
const faraway = card({
  component_uid: "3",
  lat: 56.0,
  lng: 73.0,
  component: "Задвижка",
}); // ~111 км
const noFix = card({ component_uid: "4", component: "Вентиль" });

function open(props = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <ComponentPickerSheet
      coords={here}
      onPick={onPick}
      onClose={onClose}
      {...props}
    />,
    { wrapper: componentRegistryWrapper(registry) },
  );
  return { onPick, onClose };
}

const uids = () =>
  screen.getAllByRole("button", { name: /№/ }).map((node) => node.textContent);

describe("ComponentPickerSheet", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    registry = { components: [faraway, mid, near, noFix] };
  });

  it("ставит ближние наверх, а карточки без координат — вниз, но в список", async () => {
    // Решение, которое легко нарушить «улучшением»: жёсткий круг спрятал бы
    // ровно ту карточку, за которой пришли, — под навесом фикс уезжает.
    open();
    await waitFor(() => expect(uids().length).toBe(4));

    expect(uids().map((text) => text.slice(0, 2))).toEqual([
      "№1",
      "№2",
      "№3",
      "№4",
    ]);
  });

  it("показывает дальнюю карточку, а не прячет её", async () => {
    open();

    await screen.findByText(/Задвижка/);
    // Подпись строки — тег чертежа и расстояние в одном элементе.
    expect(screen.getByText(/·\s*far$/)).toBeInTheDocument();
  });

  it("без фикса не сортирует и подписывает строки местом", async () => {
    open({ coords: null });

    await waitFor(() => expect(uids().length).toBe(4));
    // Порядок — как в реестре, расстояния мерить не от чего.
    expect(uids().map((text) => text.slice(0, 2))).toEqual([
      "№3",
      "№2",
      "№1",
      "№4",
    ]);
    expect(screen.getByText(/receiver is silent/)).toBeInTheDocument();
    expect(screen.getAllByText(/Куст 3/).length).toBeGreaterThan(0);
  });

  it("ищет и по номеру, и по имени, и по тегу на чертеже", async () => {
    open();
    await waitFor(() => expect(uids().length).toBe(4));

    const search = screen.getByLabelText("Search by number or name");
    // Значение ставится событием, а не набором по букве. Лист при открытии
    // забирает фокус себе, и посимвольный набор изредка уходил в никуда: тест
    // падал раз в несколько прогонов, показывая ещё неотфильтрованный список.
    // Проверяется здесь отбор, а не то, куда попадают нажатия.
    const ищем = (text) =>
      fireEvent.change(search, { target: { value: text } });

    ищем("задвижка");
    await waitFor(() =>
      expect(uids().map((text) => text.slice(0, 2))).toEqual(["№3"]),
    );

    ищем("v-1");
    await waitFor(() => expect(uids().length).toBe(4));

    ищем("нет такого");
    expect(await screen.findByText("Nothing found")).toBeInTheDocument();
  });

  it("отличает нечитаемый реестр от пустого", async () => {
    // Пустой реестр — приглашение завести карточку; нечитаемый — отказ
    // хранилища, и молчать о нём нельзя.
    registry = { components: [], error: new Error("storage gone") };
    open();

    expect(
      await screen.findByText("The registry could not be read"),
    ).toBeInTheDocument();

    registry = { components: [] };
    open();
    expect(
      await screen.findByText(/The registry is empty/),
    ).toBeInTheDocument();
  });

  it("отдаёт выбранную карточку целиком", async () => {
    const user = userEvent.setup();
    const { onPick } = open();
    await waitFor(() => expect(uids().length).toBe(4));

    await user.click(screen.getAllByRole("button", { name: /№1/ })[0]);

    expect(onPick).toHaveBeenCalledWith(near);
  });
  it("закрывается кнопкой, а не только нажатием мимо листа", async () => {
    // На телефоне с непустым реестром лист занимает почти весь экран, и «мимо»
    // — это полоска у верхнего края, наполовину под строкой состояния.
    // Аппаратная «Назад» в WebView в Escape не превращается, так что без
    // кнопки выхода у обходчика не оставалось.
    const user = userEvent.setup();
    const { onClose } = open();
    await waitFor(() => expect(uids().length).toBe(4));

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
