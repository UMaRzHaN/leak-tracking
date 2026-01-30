function scrollWithOffset(element, offset = 0) {
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  const top = rect.top + scrollTop - offset;

  window.scrollTo({
    top,
    behavior: "smooth",
  });
}

export function useEnterNavigation({ onLast, headerOffset = 64 }) {
  const handleSubmit = (form, activeEl) => {
    if (!form) {
      onLast?.();
      return;
    }

    const focusable = Array.from(
      form.querySelectorAll("[data-enter-nav]"),
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);

    const current = activeEl ?? document.activeElement;
    const index = focusable.indexOf(current);
    const next = focusable[index + 1];

    if (next) {
      next.focus({ preventScroll: true });
      scrollWithOffset(next, headerOffset);
      return;
    }

    onLast?.();
  };
  const completeFromElement = (el) => {
    const form = el?.closest("form");
    if (!form) return;

    requestAnimationFrame(() => {
      handleSubmit(form, el);
    });
  };

  return { handleSubmit, completeFromElement };
}
