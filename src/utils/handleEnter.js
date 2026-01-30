export function handleEnter(e, ref, onEnter) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  ref.current?.blur();
  onEnter?.(ref.current);
}
