import { useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const modalStack = [];

// Живые области озвучиваются сами и мимо фокуса: уведомление об итоге
// действия часто и появляется-то в ответ на нажатие внутри диалога. Погасить
// их вместе с фоном значило бы отобрать у читателя именно тот текст, ради
// которого он нажимал.
//
// Поэтому уведомление и уходит порталом в `document.body` — там оно сосед
// диалога, а не потомок фона.
const LIVE_REGION = '[aria-live], [role="alert"], [role="status"]';

// Затемнение — не фон под диалогом, а его собственная часть: нажатие по нему
// диалог закрывает. Гасить его нельзя, а под общее правило оно попадает,
// потому что лежит диалогу соседом, а не предком. Погашенный элемент не
// принимает нажатий вовсе, и выход через затемнение переставал работать
// молча — у листа выбора компонента, просмотра чертежа и карточки реестра
// разом.
//
// Для чтеца с экрана оно по-прежнему прячется: `aria-hidden` ставится, а
// `inert` — нет. Читать там нечего, а нажимать есть что.
const BACKDROP = "[data-modal-backdrop]";

// Пометка ставится своим атрибутом, а не читается из свойства `inert`: в
// старом WebView свойства может не быть, и вложенный диалог принял бы уже
// погашенный фон за незатронутый — а на закрытии вернул бы его, пока внешний
// диалог ещё открыт.
const MARKER = "data-modal-inert";

/**
 * Живая область — только сама область, не всё, внутри чего она нашлась.
 *
 * Поиск по потомкам выводил из-под гашения целый контейнер: у страницы почти
 * всегда есть где-нибудь `role="status"` — баннер обновления, предупреждение о
 * загрузке данных, строка хода импорта. Хуже всего это работало у модалок,
 * отрисованных порталом в `body`: соседом там оказывается корень приложения,
 * внутри которого такая область находится почти наверняка, — и не гасилось
 * вообще ничего.
 *
 * Живая область под модалкой всё равно ничего не рассказывает: она описывает
 * то, чего сейчас не касаются. А та единственная, ради которой делалось
 * исключение, — уведомление об итоге действия — лежит порталом в `body` и под
 * `matches` попадает сама.
 */
function isLiveRegion(element) {
  return element.matches(LIVE_REGION);
}

/**
 * Гасит всё, кроме пути от диалога до корня.
 *
 * Ловушка фокуса не пускает внутрь фона клавиатуру, но не трогает дерево
 * доступности: свайп-навигация VoiceOver и TalkBack уходила в содержимое под
 * модалкой. `inert` убирает его целиком; `aria-hidden` — на случай WebView,
 * который `inert` ещё не понимает.
 *
 * Идём вверх от самого диалога, а не по детям `body`: часть модалок
 * отрисована прямо в дереве приложения, и там гашение верхнего уровня не
 * задело бы ничего.
 *
 * @param {Element | null} dialog
 * @returns {() => void} снять ровно то, что поставили
 */
function inertOutside(dialog) {
  const marked = [];
  let node = dialog;
  while (node?.parentElement) {
    for (const sibling of node.parentElement.children) {
      // Только HTMLElement: у `children` тип шире, и свойства `inert` нет,
      // например, у вложенного SVG.
      if (!(sibling instanceof HTMLElement)) continue;
      if (sibling === node) continue;
      if (sibling.hasAttribute(MARKER)) continue;
      if (isLiveRegion(sibling)) continue;
      sibling.setAttribute(MARKER, "");
      sibling.setAttribute("aria-hidden", "true");
      if (!sibling.matches(BACKDROP)) sibling.inert = true;
      marked.push(sibling);
    }
    node = node.parentElement;
  }

  return () => {
    for (const element of marked) {
      element.removeAttribute(MARKER);
      element.removeAttribute("aria-hidden");
      element.inert = false;
    }
  };
}

/**
 * @param {{
 *   open?: boolean,
 *   onClose?: (() => void)|null,
 *   closeDisabled?: boolean,
 * }} options
 */
export function useModalDialog({
  open = true,
  onClose = null,
  closeDisabled = false,
}) {
  const dialogRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const closeRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  const modalIdRef = useRef(Symbol("modal"));

  closeRef.current = onClose;
  disabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return undefined;
    const modalId = modalIdRef.current;
    modalStack.push(modalId);

    const previousFocus = document.activeElement;
    // Гашение фона откладывается вместе с фокусом: диалог попадает в дерево
    // тем же кадром, и до отрисовки идти по нему вверх не от чего.
    let releaseInert = () => {};
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      releaseInert = inertOutside(dialog);
      const target =
        /** @type {HTMLElement|null} */ (dialog?.querySelector(FOCUSABLE)) ??
        dialog;
      target?.focus();
    });

    const handleKeyDown = (event) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (modalStack[modalStack.length - 1] !== modalId) return;

      if (event.key === "Escape" && !disabledRef.current) {
        event.preventDefault();
        closeRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = /** @type {HTMLElement[]} */ ([
        ...dialog.querySelectorAll(FOCUSABLE),
      ]);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      releaseInert();
      document.removeEventListener("keydown", handleKeyDown);
      const stackIndex = modalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  return dialogRef;
}
