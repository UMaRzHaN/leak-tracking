import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useComponentRegistry } from "@/features/componentRegistry/useComponentRegistry";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import { useVoiceControl } from "@/app/hooks/useVoiceControl";
import ComponentCardForm from "./ComponentCardForm";
import SchemaList from "@/features/schemas/SchemaList";
import ComponentCardCompact from "@/features/componentRegistry/ComponentCardCompact";
import ComponentInspectSheet from "@/features/componentRegistry/ComponentInspectSheet";
import ComponentDetailsSheet from "@/features/componentRegistry/ComponentDetailsSheet";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { createRecordId } from "@/utils/createRecordId";
import { withStoredPhoto } from "@/features/componentRegistry/componentPhoto";
import {
  canWriteRegistry,
  recordComponentCreated,
  recordComponentEdited,
  recordComponentInspected,
} from "@/domain/componentHistory";
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
export default function ComponentRegistry({
  project,
  coords = null,
  cardPage = false,
  userProfile = null,
  onOpenCard = null,
  onCloseCard = null,
}) {
  const { t } = useLanguage();
  const {
    enabled,
    steps,
    fields,
    components,
    lastComponent,
    conflicts,
    conflictingIds,
    loading,
    error,
    addComponent,
    updateComponent,
    removeComponent,
    findConflicts,
  } = useComponentRegistry(project);

  const { componentPhotoRequired } = usePhotoRequirements(project?.id ?? null);
  const { savePhoto } = usePhotoStorage();
  /*
   * The microphone the leak form offers, on the same screen furniture. Speech
   * recognition starts and stops; nothing is filled in yet, because the
   * registry declares no voice mapping of its own — that comes with the fields
   * it should write to.
   */
  const { startVoiceInput, stopVoiceInput } = useVoiceControl();

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState(ALL);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("components");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [inspecting, setInspecting] = useState(null);
  const [viewing, setViewing] = useState(null);

  /*
   * Nothing is written without a name. Every history entry is signed, and a
   * registry nobody signs is a list of assertions with no one behind them — the
   * first disagreement about a reading would have nowhere to go.
   */
  const canWrite = canWriteRegistry(userProfile);

  const texts = useMemo(
    () => ({
      addTitle: t("components.addTitle"),
      editTitle: t("components.editTitle"),
      stepPrefix: t("components.stepPrefix"),
      cancel: t("components.cancel"),
      // Shaped the way the leak form's header, footer and clear actions expect
      // their labels, since the card reuses all three.
      buttons: {
        prev: t("components.buttons.prev"),
        next: t("components.buttons.next"),
        save: t("components.buttons.save"),
        saving: t("components.buttons.saving"),
        clearStep: t("components.buttons.clearStep"),
        clearAll: t("components.buttons.clearAll"),
      },
      duplicateWarning: (count) => t("components.duplicateWarning", { count }),
      copyConfirm: {
        title: t("components.copyConfirm.title"),
        description: t("components.copyConfirm.description"),
        confirmLabel: t("components.copyConfirm.confirmLabel"),
        cancelLabel: t("components.copyConfirm.cancelLabel"),
      },
      errors: {
        required: t("components.errors.required"),
        photoRequired: t("components.errors.photoRequired"),
        digitsOnly: t("components.errors.digitsOnly"),
        badCoordinate: t("components.errors.badCoordinate"),
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
          (!conflictsOnly || conflictingIds.has(component.id)) &&
          matchesSearch(component, search),
      ),
    [components, conflictingIds, conflictsOnly, locationFilter, search],
  );

  /**
   * The page follows the card, not the other way round: opening one switches to
   * the full-screen page, closing it returns to the list. Stated as an
   * invariant so a reload that lands on the card page with nothing open — the
   * page value is remembered, the card is not — corrects itself instead of
   * showing the list under a hidden navigation bar.
   */
  const openCard = useCallback(
    (card) => {
      setEditing(card);
      onOpenCard?.();
    },
    [onOpenCard],
  );

  const closeCard = useCallback(() => {
    setEditing(null);
    onCloseCard?.();
  }, [onCloseCard]);

  useEffect(() => {
    // Page and card are kept in step in both directions. Opening a card asks
    // for the page; leaving the page — by the header arrow, but equally by the
    // hardware back button, which the app turns into history navigation —
    // closes the card. Syncing one way only left the form on screen with the
    // navigation already back underneath it.
    if (editing && !cardPage) setEditing(null);
    else if (!editing && cardPage) onCloseCard?.();
  }, [cardPage, editing, onCloseCard]);

  const handleSave = useCallback(
    async (form) => {
      const user = userProfile?.name;
      const id = editing?.id ?? createRecordId();
      // The input hands over a blob and a preview; a card stores a path. The
      // leak form has always converted between the two, and so must this one —
      // writing the object straight onto the card left the photo unsaved and
      // every reader calling startsWith on an object.
      const card = await withStoredPhoto({ ...form, id }, id, savePhoto);

      if (editing?.id) {
        await updateComponent(
          editing.id,
          recordComponentEdited(
            editing,
            { ...editing, ...card },
            { user, fields: fields?.all ?? [] },
          ),
        );
      } else {
        await addComponent(recordComponentCreated(card, { user }));
      }
      closeCard();
    },
    [
      addComponent,
      closeCard,
      editing,
      fields,
      savePhoto,
      updateComponent,
      userProfile,
    ],
  );

  const handleInspect = useCallback(
    async (status) => {
      const card = inspecting;
      setInspecting(null);
      if (!card) return;
      await updateComponent(
        card.id,
        recordComponentInspected(card, { status, user: userProfile?.name }),
      );
    },
    [inspecting, updateComponent, userProfile],
  );

  if (!enabled) return null;

  // The form waits on the declaration that arrives with the screen; the list
  // behind it renders from stored data and needs nothing from the config.
  if (editing && steps) {
    return (
      <ComponentCardForm
        steps={steps.steps}
        coords={coords}
        copyableFields={fields?.copyable ?? []}
        lastComponent={lastComponent}
        component={editing.id ? editing : null}
        findConflicts={findConflicts}
        onSave={handleSave}
        onCancel={closeCard}
        texts={texts}
        t={t}
        photoRequired={componentPhotoRequired}
        startVoiceInput={startVoiceInput}
        stopVoiceInput={stopVoiceInput}
      />
    );
  }

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1>{t("components.title")}</h1>
        {/* Drawings sit next to the registry rather than in settings: they are
            consulted while a card is being filled in, not configured once. */}
        <div className={s.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "components"}
            className={tab === "components" ? s.tabActive : s.tab}
            onClick={() => setTab("components")}
          >
            {t("components.tab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "schemas"}
            className={tab === "schemas" ? s.tabActive : s.tab}
            onClick={() => setTab("schemas")}
          >
            {t("schemas.tab")}
          </button>
        </div>
        {tab === "components" && (
          <p className={s.count}>
            {t("components.count", { count: components.length })}
            {visible.length !== components.length &&
              ` · ${t("components.shown", { count: visible.length })}`}
          </p>
        )}
      </header>

      {tab === "schemas" && <SchemaList project={project} />}

      {viewing && (
        <ComponentDetailsSheet
          component={viewing}
          fields={fields?.viewable ?? []}
          onEdit={(card) => {
            setViewing(null);
            if (canWrite) openCard(card);
          }}
          onRemove={async (card) => {
            setViewing(null);
            await removeComponent(card.id);
          }}
          onClose={() => setViewing(null)}
        />
      )}

      {inspecting && (
        <ComponentInspectSheet
          component={inspecting}
          onPick={handleInspect}
          onClose={() => setInspecting(null)}
        />
      )}

      {tab === "components" && (
        <>
          {error && (
            <p className={s.error} role="alert">
              {t("components.loadError")}
            </p>
          )}

          {/* Two devices with no allotted number ranges collide by design. The
              merge keeps both cards and says so here; renumbering is a call
              only somebody who saw the equipment can make. */}
          {conflicts.length > 0 && (
            <p className={s.warning} role="status">
              {t("components.conflictBanner", { count: conflicts.length })}{" "}
              <button
                type="button"
                className={s.link}
                onClick={() => setConflictsOnly((value) => !value)}
              >
                {conflictsOnly
                  ? t("components.showAll")
                  : t("components.showConflicts")}
              </button>
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
            onClick={() => openCard({})}
            disabled={!canWrite}
          >
            {t("components.add")}
          </button>

          {/* Said once, where the button is, rather than after a walker has
              filled a card and pressed save. */}
          {!canWrite && (
            <p className={s.warning} role="status">
              {t("components.nameRequired")}
            </p>
          )}

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
                <ComponentCardCompact
                  key={component.id}
                  component={component}
                  conflicting={conflictingIds.has(component.id)}
                  onOpenDetails={setViewing}
                  onInspect={canWrite ? setInspecting : undefined}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
