import { useEffect, useRef } from "react";
import { useComponentRegistry } from "@/features/componentRegistry/useComponentRegistry";
import { useComponentDetails } from "@/features/componentRegistry/useComponentDetails";
import { canWriteRegistry } from "@/domain/componentHistory";

/**
 * Полная карточка компонента поверх карты. Отдельным куском и только по
 * «Открыть»: реестру нужно его описание с формой и словарями, а булавкам
 * хватает сохранённых записей.
 *
 * Открывается сама запись реестра, а не булавка: у булавки поверх записи
 * лежат подпись и вид, и правка унесла бы их в карточку.
 */
export default function MapComponentDetails({
  project,
  componentId,
  userProfile,
  onClose,
}) {
  const { components, fields, updateComponent, removeComponent } =
    useComponentRegistry(project);
  const details = useComponentDetails({
    fields,
    canEdit: canWriteRegistry(userProfile),
    userProfile,
    updateComponent,
    removeComponent,
  });
  const { open } = details;
  const record = components.find((item) => item?.id === componentId) ?? null;
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current || !record) return;
    openedRef.current = true;
    open(record);
  }, [open, record]);

  // Лист закрыли (или удалили карточку) — обёртка уходит вместе с ним.
  const shown = details.element !== null;
  useEffect(() => {
    if (openedRef.current && !shown) onClose();
  }, [shown, onClose]);

  return details.element;
}
