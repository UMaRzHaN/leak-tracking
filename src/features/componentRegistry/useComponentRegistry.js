import { useCallback, useEffect, useMemo, useState } from "react";
import {
  compareComponentsByUid,
  findComponentUidConflicts,
} from "@/domain/componentRegistry";
import { findUidConflicts } from "@/domain/componentMerge";
import { withComponentRemoved } from "@/domain/componentTombstones";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { loadComponentRegistry } from "@/configs/projectAdapter";
import { useComponentRegistryStore } from "./ComponentRegistryContext";
import { logger } from "@/utils/logger";

/**
 * Экран реестра: объявление реестра плюс всё, что считается по списку.
 *
 * Сам список и запись в него живут в провайдере — их же читают карта, шапка и
 * выбор карточки в форме, и второй копии здесь быть не должно. Отдельным
 * остаётся объявление: словари оборудования и форма в четыре шага, одиннадцать
 * килобайт, которые нужны только тому, кто рисует карточку. Карта берёт список
 * из того же провайдера и за объявление не платит.
 */
export function useComponentRegistry(project) {
  const {
    enabled: storeEnabled,
    components,
    loading,
    error,
    persist,
  } = useComponentRegistryStore();
  const enabled =
    storeEnabled && Boolean(project?.id) && hasComponentRegistry(project);

  const [registry, setRegistry] = useState(null);
  const [configError, setConfigError] = useState(null);
  const validation = registry?.validation ?? null;

  useEffect(() => {
    if (!enabled) {
      setRegistry(null);
      return undefined;
    }
    let cancelled = false;
    loadComponentRegistry(project)
      .then((loaded) => !cancelled && setRegistry(loaded))
      .catch((loadError) => {
        if (cancelled) return;
        logger.error("[components] registry config load failed:", loadError);
        setConfigError(loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, project]);

  const write = useCallback(
    (recompute) =>
      persist(recompute, { numericKeys: validation?.numericKeys ?? [] }),
    [persist, validation],
  );

  const addComponent = useCallback(
    (component) => write((current) => [...current, component]),
    [write],
  );

  const updateComponent = useCallback(
    (id, changes) =>
      write((current) =>
        current.map((component) =>
          component.id === id ? { ...component, ...changes } : component,
        ),
      ),
    [write],
  );

  // Удаление оставляет на месте карточки запись о том, что её удалили: иначе
  // первый же обмен с соседним телефоном вернул бы её обратно — молча, потому
  // что для него она просто есть.
  const removeComponent = useCallback(
    (id) => write((current) => withComponentRemoved(current, id)),
    [write],
  );

  const findConflicts = useCallback(
    (uid, selfId) => findComponentUidConflicts(components, uid, selfId),
    [components],
  );

  const sorted = useMemo(
    () => [...components].sort(compareComponentsByUid),
    [components],
  );

  /**
   * The card written most recently, whatever the list is sorted by. Walking a
   * row of identical gauges means most of the passport repeats, so the form
   * shows this one's values as hints in the empty fields.
   *
   * По `date`, а не по `updatedAt`. `updatedAt` для этой задачи не работает
   * вовсе: сохраняется всегда весь реестр целиком, `normalizeComponent`
   * проставляет метку каждой карточке одним и тем же `now`, и после любой
   * записи они равны у всех. Сравнение с `>=` в такой ничьей выбирало просто
   * последнюю карточку в массиве — для заведённых на телефоне это случайно
   * совпадало с замыслом, потому что новая дописывается в конец, а после
   * импорта инвентаризации в конце оказывалась произвольная карточка из
   * архива. Обычно заполненная на треть — отсюда и подсказки, которые
   * появлялись у одних полей и не появлялись у других.
   *
   * `date` ставится один раз при заведении и дальше не двигается, в том числе
   * у карточки, приехавшей с другого телефона: там это по-прежнему момент,
   * когда её завели.
   */
  const lastComponent = useMemo(() => {
    let latest = null;
    let latestTime = -Infinity;
    for (const component of components) {
      const time = Date.parse(component?.date ?? "");
      // Карточка без читаемой даты — из ранних версий формата. Она годится
      // только пока не нашлось ни одной датированной.
      const rank = Number.isFinite(time) ? time : -Infinity;
      if (!latest || rank >= latestTime) {
        latest = component;
        latestTime = rank;
      }
    }
    return latest;
  }, [components]);

  /**
   * Cards sharing an identity number. Recomputed from what is stored rather
   * than remembered from the merge, so a collision typed on this device shows
   * up the same way as one that arrived from another.
   */
  const conflicts = useMemo(() => findUidConflicts(components), [components]);
  const conflictingIds = useMemo(
    () =>
      new Set(
        conflicts.flatMap((conflict) =>
          conflict.records.map((record) => record.id),
        ),
      ),
    [conflicts],
  );

  return {
    enabled,
    steps: registry?.steps ?? null,
    fields: registry?.fields ?? null,
    voice: registry?.voice ?? null,
    components: sorted,
    lastComponent,
    conflicts,
    conflictingIds,
    loading: enabled && (loading || (!registry && !configError)),
    error: error ?? configError,
    validation,
    addComponent,
    updateComponent,
    removeComponent,
    findConflicts,
  };
}
