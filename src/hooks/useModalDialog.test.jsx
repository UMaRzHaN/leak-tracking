import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useModalDialog } from "./useModalDialog";

function DialogFixture({ onClose }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose();
  };
  const ref = useModalDialog({ open, onClose: close });
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <div ref={ref} role="dialog" tabIndex={-1}>
          <button>first</button>
          <button>last</button>
        </div>
      )}
    </>
  );
}

function NestedDialogFixture({ onParentClose, onChildClose }) {
  const parentRef = useModalDialog({ onClose: onParentClose });
  const childRef = useModalDialog({ onClose: onChildClose });
  return (
    <div ref={parentRef} role="dialog" aria-label="parent" tabIndex={-1}>
      <button>parent action</button>
      <div ref={childRef} role="dialog" aria-label="child" tabIndex={-1}>
        <button>child action</button>
      </div>
    </div>
  );
}

describe("useModalDialog", () => {
  it("focuses the dialog, traps Tab, closes on Escape and restores focus", async () => {
    const onClose = vi.fn();
    render(<DialogFixture onClose={onClose} />);
    const opener = screen.getByText("open");
    opener.focus();
    fireEvent.click(opener);

    const first = screen.getByText("first");
    const last = screen.getByText("last");
    await waitFor(() => expect(document.activeElement).toBe(first));
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it("routes Escape only to the topmost nested dialog", () => {
    const onParentClose = vi.fn();
    const onChildClose = vi.fn();
    render(
      <NestedDialogFixture
        onParentClose={onParentClose}
        onChildClose={onChildClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onChildClose).toHaveBeenCalledOnce();
    expect(onParentClose).not.toHaveBeenCalled();
  });
});

/**
 * Ловушка фокуса держала клавиатуру, но дерево доступности оставалось целым:
 * свайп-навигация VoiceOver и TalkBack уходила в содержимое под модалкой.
 */
describe("useModalDialog: фон под диалогом", () => {
  function Dialog({ open }) {
    const ref = useModalDialog({ open, onClose: () => {} });
    return (
      <div>
        <div data-testid="background">
          <button type="button">за диалогом</button>
          {/* Так выглядит почти любая настоящая страница: баннер обновления,
              предупреждение о загрузке, строка хода импорта. Пока живой
              областью считалось всё, внутри чего она нашлась, такой фон
              оставался нетронутым целиком. */}
          <p role="status">идёт импорт</p>
        </div>
        <div data-testid="toast" role="alert">
          готово
        </div>
        {open ? (
          <div ref={ref} role="dialog" aria-modal="true" aria-label="Диалог">
            <button type="button">в диалоге</button>
          </div>
        ) : null}
      </div>
    );
  }

  // Фон здесь не пустой: внутри него живёт `role="status"`. Пока живой
  // областью считалось всё, внутри чего она нашлась, такой фон — то есть почти
  // любой настоящий — оставался нетронутым целиком.
  it("гасит содержимое вокруг диалога", async () => {
    render(<Dialog open />);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const background = screen.getByTestId("background");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(background.inert).toBe(true);
  });

  // Уведомление об итоге действия часто и появляется-то в ответ на нажатие
  // внутри диалога — гасить его вместе с фоном значит отобрать именно тот
  // текст, ради которого нажимали. Оно и уходит порталом в `body`, где
  // оказывается соседом диалога.
  it("оставляет живые области слышимыми", async () => {
    render(<Dialog open />);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(screen.getByTestId("toast")).not.toHaveAttribute("aria-hidden");
  });

  it("возвращает фон при закрытии", async () => {
    const { rerender } = render(<Dialog open />);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    rerender(<Dialog open={false} />);

    const background = screen.getByTestId("background");
    expect(background).not.toHaveAttribute("aria-hidden");
    expect(background.inert).toBe(false);
  });
});
