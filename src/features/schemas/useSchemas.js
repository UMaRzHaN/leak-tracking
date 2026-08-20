import { useCallback, useEffect, useRef, useState } from "react";
import { SchemaRepository } from "@/repositories/SchemaRepository";
import {
  createSchemaEntry,
  isSupportedSchema,
} from "@/domain/technologicalSchemas";
import { logger } from "@/utils/logger";

/**
 * The technological schemas attached to a project.
 *
 * Schemas can be loaded ahead of a walk or added while it is under way — both
 * are ordinary paths, so nothing here assumes an empty list means "not set up
 * yet".
 */
export function useSchemas(project) {
  const enabled = Boolean(project?.id);

  const [schemas, setSchemas] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  /** @type {import("react").MutableRefObject<Promise<any>>} */
  const writeQueueRef = useRef(Promise.resolve());

  const reload = useCallback(async () => {
    if (!enabled) {
      setSchemas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSchemas(await SchemaRepository.listSchemas(project));
    } catch (loadError) {
      logger.error("[schemas] list failed:", loadError);
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [enabled, project]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setSchemas([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError(null);
    SchemaRepository.listSchemas(project)
      .then((list) => !cancelled && setSchemas(list))
      .catch((loadError) => {
        if (cancelled) return;
        logger.error("[schemas] list failed:", loadError);
        setError(loadError);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [enabled, project]);

  /**
   * Copies a picked file into app storage.
   *
   * Serialized behind the same queue as removal: both rewrite the whole index,
   * and adding two drawings in quick succession would otherwise lose one.
   *
   * @param {File} file
   * @param {{location?: string}} [options]
   */
  const addSchema = useCallback(
    (file, { location = "" } = {}) => {
      if (!enabled) return Promise.resolve(null);

      const run = writeQueueRef.current.then(async () => {
        const entry = createSchemaEntry(file, { location });
        if (!isSupportedSchema(entry)) {
          const unsupported = new Error("Unsupported schema format");
          unsupported.code = "SCHEMA_UNSUPPORTED";
          throw unsupported;
        }

        await SchemaRepository.addSchema(project, entry, file);
        setSchemas((current) => [...current, entry]);
        return entry;
      });

      // Empty on purpose: `run` is returned to the caller, which is what
      // reports the failure. This branch only keeps the queue chain alive so
      // one rejected write does not wedge every write after it.
      // eslint-disable-next-line no-restricted-syntax
      writeQueueRef.current = run.catch(() => {});
      return run;
    },
    [enabled, project],
  );

  const removeSchema = useCallback(
    (schema) => {
      if (!enabled) return Promise.resolve(false);

      const run = writeQueueRef.current.then(async () => {
        const removed = await SchemaRepository.removeSchema(project, schema);
        if (removed) {
          setSchemas((current) =>
            current.filter((entry) => entry.id !== schema.id),
          );
        }
        return removed;
      });

      // Empty on purpose: `run` is returned to the caller, which is what
      // reports the failure. This branch only keeps the queue chain alive so
      // one rejected write does not wedge every write after it.
      // eslint-disable-next-line no-restricted-syntax
      writeQueueRef.current = run.catch(() => {});
      return run;
    },
    [enabled, project],
  );

  const readSchemaFile = useCallback(
    (schema) => SchemaRepository.readSchemaFile(project, schema),
    [project],
  );

  return {
    schemas,
    loading,
    error,
    addSchema,
    removeSchema,
    readSchemaFile,
    reload,
  };
}
