import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComponentRepository } from "@/repositories/ComponentRepository";
import {
  compareComponentsByUid,
  findComponentUidConflicts,
  nextComponentUid,
} from "@/domain/componentRegistry";
import { findUidConflicts } from "@/domain/componentMerge";
import {
  hasComponentRegistry,
  loadComponentRegistry,
} from "@/configs/projectAdapter";
import { logger } from "@/utils/logger";

/**
 * Loads and mutates the component registry of the active project.
 *
 * Writes are serialized through a promise chain for the same reason the leak
 * data is: two cards saved in quick succession — which is exactly how a walk
 * goes — would otherwise race on a whole-list replace and drop one of them.
 */
export function useComponentRegistry(project) {
  const enabled = Boolean(project?.id) && hasComponentRegistry(project);

  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  /** @type {import("react").MutableRefObject<Promise<any>>} */
  const writeQueueRef = useRef(Promise.resolve([]));
  // Mutations read this rather than state so a save started before a re-render
  // still builds on the list it was computed from.
  const latestRef = useRef([]);

  // The declaration arrives with the screen rather than with the app: it
  // carries the equipment dictionaries and the four-step form, which no
  // session that never opens the registry should have to download.
  const [registry, setRegistry] = useState(null);
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
        setError(loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, project]);

  useEffect(() => {
    if (!enabled) {
      latestRef.current = [];
      setComponents([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    ComponentRepository.load(project)
      .then((loaded) => {
        if (cancelled) return;
        latestRef.current = loaded;
        setComponents(loaded);
      })
      .catch((loadError) => {
        if (cancelled) return;
        logger.error("[components] registry load failed:", loadError);
        setError(loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, project]);

  /**
   * Queues a write, deriving the next list *inside* the queue.
   *
   * The recompute must not run at call time: two cards saved back to back —
   * which is exactly how a walk goes — would both derive from the same
   * pre-write list, and the second whole-list replace would silently drop the
   * first. Deriving inside the chain means each write sees the one before it.
   */
  const persist = useCallback(
    (recompute) => {
      if (!enabled) return Promise.resolve([]);

      const run = writeQueueRef.current.then(async () => {
        const stored = await ComponentRepository.save(
          project,
          recompute(latestRef.current),
          { numericKeys: validation?.numericKeys ?? [] },
        );
        latestRef.current = stored;
        setComponents(stored);
        return stored;
      });

      // Keep the chain alive after a rejection so one failed save does not
      // wedge every later one.
      writeQueueRef.current = run.catch(() => {});
      return run;
    },
    [enabled, project, validation],
  );

  const addComponent = useCallback(
    (component) => persist((current) => [...current, component]),
    [persist],
  );

  const updateComponent = useCallback(
    (id, changes) =>
      persist((current) =>
        current.map((component) =>
          component.id === id ? { ...component, ...changes } : component,
        ),
      ),
    [persist],
  );

  const removeComponent = useCallback(
    (id) =>
      persist((current) => current.filter((component) => component.id !== id)),
    [persist],
  );

  /**
   * The number to offer for the next card. Computed over everything currently
   * loaded, which after a sync includes what other devices wrote.
   */
  const suggestNextUid = useCallback(
    () => nextComponentUid(latestRef.current),
    [],
  );

  const findConflicts = useCallback(
    (uid, selfId) => findComponentUidConflicts(latestRef.current, uid, selfId),
    [],
  );

  const sorted = useMemo(
    () => [...components].sort(compareComponentsByUid),
    [components],
  );

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
    components: sorted,
    conflicts,
    conflictingIds,
    loading,
    error,
    validation,
    addComponent,
    updateComponent,
    removeComponent,
    suggestNextUid,
    findConflicts,
  };
}
