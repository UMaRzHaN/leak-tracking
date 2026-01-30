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
  const handleEnter = (current) => {
    if (!current?.form) {
      onLast?.();
      return;
    }

    const focusable = Array.from(
      current.form.querySelectorAll(
        "input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter(
      (el) =>
        !el.disabled &&
        !el.readOnly &&
        el.offsetParent !== null,
    );

    const index = focusable.indexOf(current);
    const next = focusable[index + 1];

    if (next) {
      next.focus();

      // ✅ SCROLL С УЧЁТОМ HEADER
      scrollWithOffset(next, headerOffset);

      return;
    }

    onLast?.();
  };

  return { handleEnter };
}

