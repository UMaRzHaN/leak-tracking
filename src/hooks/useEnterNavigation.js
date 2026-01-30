function scrollWithOffset(element, offset = 0) {
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const scrollTop =
    window.pageYOffset || document.documentElement.scrollTop;

  const top = rect.top + scrollTop - offset;

  window.scrollTo({
    top,
    behavior: "smooth",
  });
}

export function useEnterNavigation({
  onLast,
  headerOffset = 64,
  includeReadonly = false,
}) {
  const handleEnter = (current) => {
    if (!current?.form) {
      onLast?.();
      return;
    }

    const focusable = Array.from(
      current.form.querySelectorAll(
        "input, textarea, select, [tabindex='0']",
      ),
    ).filter((el) => {
      if (el.disabled) return false;
      if (!includeReadonly && el.readOnly) return false;
      if (el.offsetParent === null) return false; // hidden
      return true;
    });

    const index = focusable.indexOf(current);
    if (index === -1) {
      onLast?.();
      return;
    }

    const next = focusable[index + 1];

    if (next) {
      next.focus({ preventScroll: true });
      scrollWithOffset(next, headerOffset);
      return;
    }

    onLast?.();
  };

  return { handleEnter };
}
