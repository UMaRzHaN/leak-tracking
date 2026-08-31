import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useComponentRegistry } from "@/features/componentRegistry/useComponentRegistry";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import ComponentCardForm from "./ComponentCardForm";
import SchemaList from "@/features/schemas/SchemaList";
import ComponentCardCompact from "@/features/componentRegistry/ComponentCardCompact";
import VirtualizedLeakList from "@/features/leakList/VirtualizedLeakList/VirtualizedLeakList";
import ComponentInspectSheet from "@/features/componentRegistry/ComponentInspectSheet";
import ComponentDetailsSheet from "@/features/componentRegistry/ComponentDetailsSheet";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import Notification from "@/components/ui/Notification/Notification";
import ComponentFilterBar from "./components/ComponentFilterBar";
import { useRegistryFilters } from "./hooks/useRegistryFilters";
import ComponentResultsBar from "./components/ComponentResultsBar";
import { useInventoryExport } from "./hooks/useInventoryExport";
import { matchesLeakLocationFilter } from "@/utils/locationFilter";
import { getDistanceMeters } from "@/utils/geoUtils";
import { hasCoordsFix } from "@/utils/coordsFix";
import { NEARBY_RADIUS_OPTIONS } from "@/pages/DataBase/hooks/useDataBaseFilters";
import { usedComponentStatuses } from "@/domain/componentStatuses";
import { createRecordId } from "@/utils/createRecordId";
import { withStoredPhoto } from "@/features/componentRegistry/componentPhoto";
import {
  canWriteRegistry,
  recordComponentCreated,
  recordComponentEdited,
  recordComponentInspected,
} from "@/domain/componentHistory";
import s from "./ComponentRegistry.module.scss";

function withinRadius(component, coords, radius) {
  return (
    getDistanceMeters(coords.lat, coords.lng, component.lat, component.lng) <=
    radius
  );
}

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
  coords = /** @type {{lat?: number, lng?: number}|null} */ (null),
  gpsEnabled = true,
  setGpsEnabled = /** @type {((enabled: boolean) => void)|null} */ (null),
  cardPage = false,
  userProfile = /** @type {any} */ (null),
  sharedFilters = /** @type {any} */ (null),
  onOpenCard = /** @type {(() => void)|null} */ (null),
  onCloseCard = /** @type {(() => void)|null} */ (null),
}) {
  const { t } = useLanguage();
  const {
    enabled,
    steps,
    fields,
    voice,
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

  const [search, setSearch] = useState("");
  const {
    statusFilter,
    setStatusFilter,
    nearbyOnly,
    setNearbyOnly,
    nearbyRadius,
    setNearbyRadius,
  } = useRegistryFilters(sharedFilters);

  const [sortAsc, setSortAsc] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkInspecting, setBulkInspecting] = useState(false);
  const [editing, setEditing] = useState(/** @type {any} */ (null));
  const [tab, setTab] = useState("components");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [inspecting, setInspecting] = useState(/** @type {any} */ (null));
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [listHeight, setListHeight] = useState(600);
  const [viewing, setViewing] = useState(/** @type {any} */ (null));
  const [notification, setNotification] = useState(/** @type {any} */ (null));

  const notify = useCallback((type, message, options = {}) => {
    setNotification({ type, message, ...options });
  }, []);
  const { exportInventory, isExporting } = useInventoryExport({
    project,
    notify,
  });

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
      coords: {
        lat: t("components.coords.lat"),
        lng: t("components.coords.lng"),
      },
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

  // Measured rather than assumed: the list sits under a header whose height
  // changes with the conflict banner and the filters.
  useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => setListHeight(node.clientHeight || 600);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab]);

  /*
   * Место берётся из выбора в шапке, а не из своего списка: там уже стоит
   * иерархия этого типа проекта, и она одна на базу, карту, мониторинг и
   * реестр. Второй выбор рядом с первым означал бы два ответа на один вопрос.
   */
  /*
   * Обход идут ногами, и чаще нужен не весь реестр, а то железо, что стоит
   * здесь же: заводя карточку, сперва смотрят, не заведена ли она. Без фикса
   * круг ничего не отбирает — мерить не от чего.
   */
  const hasGps = hasCoordsFix(coords);
  const nearby = hasGps && nearbyOnly;

  const visible = useMemo(
    () =>
      components.filter(
        (component) =>
          matchesLeakLocationFilter(
            component,
            sharedFilters?.mainLocationFilter,
          ) &&
          matchesLeakLocationFilter(component, sharedFilters?.locationFilter) &&
          matchesLeakLocationFilter(
            component,
            sharedFilters?.lastLocationFilter,
          ) &&
          (statusFilter.length === 0 ||
            statusFilter.includes(String(component.component_status ?? ""))) &&
          (!conflictsOnly || conflictingIds.has(component.id)) &&
          (!nearby || withinRadius(component, coords, nearbyRadius)) &&
          matchesSearch(component, search),
      ),
    [
      components,
      conflictingIds,
      conflictsOnly,
      coords,
      nearby,
      nearbyRadius,
      search,
      sharedFilters,
      statusFilter,
    ],
  );

  /** Сколько железа в круге — то же число, что у базы под тумблером. */
  const nearbyCount = useMemo(
    () =>
      hasGps
        ? components.filter((component) =>
            withinRadius(component, coords, nearbyRadius),
          ).length
        : 0,
    [components, coords, hasGps, nearbyRadius],
  );

  /**
   * Состояния, которые встречаются в реестре, — а не те, что есть в словаре.
   *
   * Поле открытое: обходчик вправе написать «законсервирован до весны», и
   * такая карточка отбором не находилась вовсе — кнопки для её состояния
   * просто не существовало. Порядок словаря сохранён, дописанное руками идёт
   * после него.
   */
  const usedStatuses = useMemo(
    () => usedComponentStatuses(components),
    [components],
  );

  const statusCounts = useMemo(() => {
    const counts = { all: components.length };
    for (const component of components) {
      const status = String(component.component_status ?? "").trim();
      if (!status) continue;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [components]);

  const toggleStatus = useCallback(
    (status) => {
      setStatusFilter((current) =>
        current.includes(status)
          ? current.filter((item) => item !== status)
          : [...current, status],
      );
    },
    [setStatusFilter],
  );

  /*
   * По номеру, а не по дате: список утечек читают по свежести, потому что
   * важно, что нашли сегодня, а обход идут по номерам, и «9 после 1» вместо
   * «9 после 8» сбивает поиск карточки глазами.
   */
  const ordered = useMemo(
    () => (sortAsc ? visible : [...visible].reverse()),
    [sortAsc, visible],
  );

  const selectDisplayed = useCallback(() => {
    setSelectedIds(new Set(visible.map((component) => component.id)));
  }, [visible]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allDisplayedSelected =
    visible.length > 0 &&
    visible.every((component) => selectedIds.has(component.id));

  /**
   * Расстояние до карточки от того места, где человек стоит.
   *
   * Только при включённом круге — так же, как в списке утечек, где значок
   * ставит сам отбор по близости. Спрашивают о расстоянии тогда же, когда его
   * включают; в остальное время это число на каждой строке, которого никто не
   * просил, и оно отнимает место у наименования.
   */
  const distanceTo = useCallback(
    (component) => {
      if (!nearby) return null;
      const meters = getDistanceMeters(
        coords?.lat,
        coords?.lng,
        component.lat,
        component.lng,
      );
      return Number.isFinite(meters) ? Math.round(meters) : null;
    },
    [coords, nearby],
  );

  const renderCard = useCallback(
    (component) => (
      <ComponentCardCompact
        component={component}
        conflicting={conflictingIds.has(component.id)}
        selected={selectedIds.has(component.id)}
        distance={distanceTo(component)}
        onToggleSelect={canWrite ? toggleSelect : undefined}
        onOpenDetails={setViewing}
        onInspect={canWrite ? setInspecting : undefined}
      />
    ),
    [canWrite, conflictingIds, distanceTo, selectedIds, toggleSelect],
  );

  /*
   * Осмотр списком. Обход идёт линией: подряд стоящее железо осматривают
   * разом и находят в одном состоянии, и отмечать это по одной карточке —
   * переписывать один ответ двадцать раз.
   *
   * Запись всё равно идёт по одной: каждая карточка получает свою подпись и
   * свою отметку о времени, потому что осмотр — это событие с человеком за
   * ним, а не свойство выборки.
   */
  const inspectSelected = useCallback(
    async (status) => {
      setBulkInspecting(false);
      const user = userProfile?.name;
      for (const card of components) {
        if (!selectedIds.has(card.id)) continue;
        await updateComponent(
          card.id,
          recordComponentInspected(card, { status, user }),
        );
      }
      clearSelection();
    },
    [clearSelection, components, selectedIds, updateComponent, userProfile],
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

  /**
   * Правка из подробной карточки. Мастер заведения к ней отношения не имеет:
   * там четыре шага для того, кто стоит у железа впервые, а здесь исправляют
   * одно поле, не теряя карточку из виду.
   */
  const handleEditSaved = useCallback(
    async (form) => {
      const target = viewing;
      if (!target?.id) return;
      const card = await withStoredPhoto(
        { ...form, id: target.id },
        target.id,
        savePhoto,
      );
      const recorded = recordComponentEdited(
        target,
        { ...target, ...card },
        { user: userProfile?.name, fields: fields?.all ?? [] },
      );
      await updateComponent(target.id, recorded);
      // Лист остаётся открытым и показывает сохранённое — вместе с только что
      // дописанной строкой истории: правка редко бывает одна, а закрытие
      // отправляло бы искать ту же карточку заново.
      setViewing(recorded);
    },
    [fields, savePhoto, updateComponent, userProfile, viewing],
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
        projectId={project?.id ?? null}
        coords={coords}
        gpsEnabled={gpsEnabled}
        setGpsEnabled={setGpsEnabled}
        onSavedWithoutCoords={() =>
          notify("error", t("components.noCoords.saved"))
        }
        copyableFields={fields?.copyable ?? []}
        lastComponent={lastComponent}
        component={editing.id ? editing : null}
        findConflicts={findConflicts}
        onSave={handleSave}
        onCancel={closeCard}
        texts={texts}
        t={t}
        photoRequired={componentPhotoRequired}
        voice={voice}
      />
    );
  }

  return (
    <div className={s.page}>
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />
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
          // Целиком, а не только видимые: подписи в истории берутся отсюда, и
          // поле, скрытое из карточки, всё равно должно называться по-русски.
          fields={fields?.all ?? []}
          canEdit={canWrite}
          onSave={handleEditSaved}
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

      {bulkInspecting && (
        <ComponentInspectSheet
          subtitle={t("database.selectedOf", {
            selected: selectedIds.size,
            visible: visible.length,
          })}
          onPick={inspectSelected}
          onClose={() => setBulkInspecting(false)}
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

          <ComponentFilterBar
            search={search}
            setSearch={setSearch}
            statuses={usedStatuses}
            statusFilter={statusFilter}
            onToggleStatus={toggleStatus}
            onClearStatuses={() => setStatusFilter([])}
            conflictsOnly={conflictsOnly}
            onToggleConflicts={() => setConflictsOnly((value) => !value)}
            conflictCount={conflicts.length}
            counts={statusCounts}
            hasGps={hasGps}
            nearbyOnly={nearbyOnly}
            nearbyRadius={nearbyRadius}
            nearbyRadiusOptions={NEARBY_RADIUS_OPTIONS}
            nearbyCount={nearbyCount}
            onToggleNearby={() => setNearbyOnly((value) => !value)}
            onRadiusChange={(radius) => {
              setNearbyRadius(radius);
              setNearbyOnly(true);
            }}
          />

          <ComponentResultsBar
            visibleCount={visible.length}
            totalCount={components.length}
            sortAsc={sortAsc}
            onSortToggle={() => setSortAsc((value) => !value)}
            selectedCount={selectedIds.size}
            allDisplayedSelected={allDisplayedSelected}
            onSelectDisplayed={selectDisplayed}
            onClearSelection={clearSelection}
            onInspectSelected={() => setBulkInspecting(true)}
            onExport={exportInventory}
            isExporting={isExporting}
          />

          <div className={s.actions}>
            <button
              type="button"
              className={s.primary}
              onClick={() => openCard({})}
              disabled={!canWrite}
            >
              {t("components.add")}
            </button>
          </div>

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
            /*
             * The same virtualiser the leak list uses. A finished walk is
             * thousands of cards, each with a photograph — rendering them all
             * would cost the scroll long before the registry is complete.
             */
            <div ref={listRef} className={s.list}>
              <VirtualizedLeakList
                items={ordered}
                height={listHeight}
                bottomPadding={88}
                gap={8}
                renderItem={renderCard}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
