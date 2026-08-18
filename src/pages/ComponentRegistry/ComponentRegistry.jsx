import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useComponentRegistry } from "@/features/componentRegistry/useComponentRegistry";
import ComponentCardForm from "./ComponentCardForm";
import s from "./ComponentRegistry.module.scss";

const ALL = "__all__";

function matchesSearch(component, query) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  return Object.values(component).some(
    (value) => value != null && String(value).toLowerCase().includes(needle),
  );
}

/**
 * The registry screen: what has been walked so far, and the way to add to it.
 *
 * Counts are absolute on purpose. The app does not mark a node as walked, so
 * the total number of components on the field is never known — a percentage
 * here would be invented.
 */
export default function ComponentRegistry({ project }) {
  const { t } = useLanguage();
  const {
    enabled,
    components,
    loading,
    error,
    addComponent,
    updateComponent,
    removeComponent,
    suggestNextUid,
    findConflicts,
  } = useComponentRegistry(project);

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState(ALL);
  const [editing, setEditing] = useState(null);

  const texts = useMemo(
    () => ({
      addTitle: t("components.addTitle"),
      editTitle: t("components.editTitle"),
      stepPrefix: t("components.stepPrefix"),
      save: t("components.save"),
      saving: t("components.saving"),
      cancel: t("components.cancel"),
      prev: t("components.prev"),
      next: t("components.next"),
      duplicateWarning: (count) => t("components.duplicateWarning", { count }),
      errors: {
        required: t("components.errors.required"),
        digitsOnly: t("components.errors.digitsOnly"),
      },
    }),
    [t],
  );

  const locations = useMemo(() => {
    const seen = new Set();
    for (const component of components) {
      const value = String(component.location ?? "").trim();
      if (value) seen.add(value);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "ru"));
  }, [components]);

  const visible = useMemo(
    () =>
      components.filter(
        (component) =>
          (locationFilter === ALL || component.location === locationFilter) &&
          matchesSearch(component, search),
      ),
    [components, locationFilter, search],
  );

  const handleSave = useCallback(
    async (form) => {
      if (editing?.id) await updateComponent(editing.id, form);
      else await addComponent(form);
      setEditing(null);
    },
    [addComponent, editing, updateComponent],
  );

  if (!enabled) return null;

  if (editing) {
    return (
      <ComponentCardForm
        project={project}
        component={editing.id ? editing : null}
        suggestUid={suggestNextUid}
        findConflicts={findConflicts}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
        texts={texts}
      />
    );
  }

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1>{t("components.title")}</h1>
        <p className={s.count}>
          {t("components.count", { count: components.length })}
          {visible.length !== components.length &&
            ` · ${t("components.shown", { count: visible.length })}`}
        </p>
      </header>

      {error && (
        <p className={s.error} role="alert">
          {t("components.loadError")}
        </p>
      )}

      <div className={s.filters}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("components.searchPlaceholder")}
          aria-label={t("components.searchPlaceholder")}
        />
        <select
          value={locationFilter}
          onChange={(event) => setLocationFilter(event.target.value)}
          aria-label={t("components.locationFilter")}
        >
          <option value={ALL}>{t("components.allLocations")}</option>
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className={s.primary}
        onClick={() => setEditing({})}
      >
        {t("components.add")}
      </button>

      {loading ? (
        <p className={s.muted}>{t("components.loading")}</p>
      ) : visible.length === 0 ? (
        <p className={s.muted}>
          {components.length === 0
            ? t("components.empty")
            : t("components.noMatches")}
        </p>
      ) : (
        <ul className={s.list}>
          {visible.map((component) => (
            <li key={component.id} className={s.card}>
              <button
                type="button"
                className={s.cardBody}
                onClick={() => setEditing(component)}
              >
                <span className={s.uid}>{component.component_uid || "—"}</span>
                <span className={s.name}>
                  {component.component_name || t("components.unnamed")}
                </span>
                <span className={s.meta}>
                  {[component.location, component.scheme_tag]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
              <button
                type="button"
                className={s.remove}
                onClick={() => removeComponent(component.id)}
                aria-label={t("components.remove")}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
