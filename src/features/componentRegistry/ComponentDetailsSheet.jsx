import { useMemo, useState } from "react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { useLanguage } from "@/app/hooks/useLanguage";
import PhotoBlock from "@/features/leakDetails/components/PhotoBlock";
import PhotoViewer from "@/features/photos/PhotoViewer/PhotoViewer";
import PhotoInput from "@/features/photos/PhotoInput/PhotoInput";
import EditTextField from "@/features/editTextField/EditTextField";
import {
  ACTION_ICONS,
  fmtDate,
  formatHistoryValue,
  relativeTime,
} from "@/features/leakDetails/components/viewBlockUtils";
import { COMPONENT_HISTORY_ACTIONS } from "@/domain/componentHistory";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

/** Поля, чьё значение — момент времени, а не текст. */
const DATE_KEYS = new Set(["date", "inspected_at", "installed_at"]);

/** Координаты живут на своей вкладке, а не среди паспортных величин. */
const COORD_KEYS = new Set(["lat", "lng"]);

/**
 * The card in full, wearing the leak details sheet: its shell, its hero photo,
 * its tab bar, its field rows, its action bar — the same stylesheet, not a
 * lookalike. A walker moving between a leak and the component it sits on should
 * meet one interface twice.
 *
 * What differs is only what a component has to say. No repair to follow and no
 * calculation to show, so four tabs rather than six, and the destructive action
 * sits behind the reading instead of in the list.
 *
 * Правка — тоже здесь, режимом этого же листа, как у утечки. Она открывала
 * форму заведения заново и проводила через четыре шага мастера ради одного
 * исправленного поля; человек при этом терял из виду карточку, которую правит.
 */
export default function ComponentDetailsSheet({
  component,
  fields = [],
  canEdit = true,
  onSave,
  onRemove,
  onClose,
}) {
  const { t, lang } = useLanguage();
  const dialogRef = useModalDialog({ open: true, onClose });
  const photoSrc = usePhotoSrc(component?.photo ?? null);

  const [tab, setTab] = useState("card");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  /*
   * Правки живут отдельно от карточки, пока их не сохранили: закрытый лист
   * должен оставить всё как было, а не отменять по полю.
   */
  const [draft, setDraft] = useState(/** @type {any} */ ({}));

  const editable = useMemo(
    () => fields.filter((field) => field.editable && !field.coord),
    [fields],
  );
  const coordFields = useMemo(
    () => fields.filter((field) => field.coord),
    [fields],
  );

  const startEditing = () => {
    setDraft({ ...component });
    setEditing(true);
    if (tab === "history") setTab("card");
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft({});
  };

  const setField = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const commit = async () => {
    setSaving(true);
    try {
      await onSave?.(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  /** Only what was answered — an empty row says nothing worth its space. */
  const filled = useMemo(
    () =>
      fields
        .filter((field) => field.viewable)
        .map((field) => ({ ...field, value: component?.[field.key] }))
        .filter(({ value }) => value != null && String(value).trim() !== ""),
    [component, fields],
  );

  /*
   * Разложено по вкладкам так же, как у утечки: паспорт отдельно, снимок
   * отдельно, координаты отдельно. Одним списком номер на схеме, давление и
   * широта стояли подряд, хотя отвечают на разные вопросы, и найти нужное
   * получалось только прокруткой.
   */
  const params = useMemo(
    () => filled.filter(({ key }) => !COORD_KEYS.has(key)),
    [filled],
  );
  const coords = useMemo(
    () => filled.filter(({ key }) => COORD_KEYS.has(key)),
    [filled],
  );

  const history = [...(component?.history ?? [])].reverse();

  const actionLabel = (action) =>
    ({
      [COMPONENT_HISTORY_ACTIONS.CREATED]: t("components.historyCreated"),
      [COMPONENT_HISTORY_ACTIONS.EDITED]: t("components.historyEdited"),
      [COMPONENT_HISTORY_ACTIONS.INSPECTED]: t("components.historyInspected"),
    })[action] ?? action;

  // В правке истории нет: она про то, что уже случилось, и править её нельзя.
  const tabs = [
    { id: "card", label: t("components.tabs.params") },
    { id: "photo", label: t("components.tabs.photo") },
    { id: "coords", label: t("components.tabs.coords") },
    ...(editing
      ? []
      : [{ id: "history", label: t("components.tabs.history") }]),
  ];

  const fieldValue = (key, value) =>
    DATE_KEYS.has(key) ? fmtDate(value, lang) : String(value);

  /** Заголовок поля из объявления реестра, а не ключ из кода. */
  const labelOf = (key) =>
    fields.find((field) => field.key === key)?.label ?? key;

  return (
    <>
      {viewerOpen && photoSrc && (
        <PhotoViewer
          photos={[photoSrc]}
          labels={[component?.component ?? ""]}
          initialIndex={0}
          onClose={() => setViewerOpen(false)}
        />
      )}

      <div className={s.overlay} onClick={onClose}>
        <div
          ref={dialogRef}
          className={s.sheet}
          role="dialog"
          aria-modal="true"
          aria-label={t("components.detailsTitle")}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <PhotoBlock
            src={editing ? null : photoSrc}
            status={null}
            identityNum={`№ ${component?.component_uid ?? "—"}`}
            identityTime={component?.component || t("components.unnamed")}
            onView={
              !editing && photoSrc ? () => setViewerOpen(true) : undefined
            }
            /* A component has no leak lifecycle; its state is changed by the
               inspection swipe, not from the hero. */
            onStatusChange={null}
          />

          <div className={s.tabBar}>
            {tabs.map((item) => (
              <button
                key={item.id}
                className={`${s.tab} ${tab === item.id ? s.tabActive : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={s.tabContent} key={tab}>
            {tab === "card" && editing ? (
              <div className={s.tabPane}>
                <div className={s.editSection}>
                  {editable.map(({ key, label, numeric }) => (
                    <EditTextField
                      key={key}
                      label={label}
                      value={draft[key] ?? ""}
                      numeric={numeric}
                      onChange={(value) => setField(key, value)}
                    />
                  ))}
                </div>
              </div>
            ) : tab === "photo" && editing ? (
              <div className={s.tabPane}>
                <PhotoInput
                  value={draft.photo}
                  onChange={(photo) => setField("photo", photo)}
                  label={t("components.tabs.photo")}
                />
              </div>
            ) : tab === "coords" && editing ? (
              <div className={s.tabPane}>
                <div className={s.coordGroup}>
                  <div className={s.coordPair}>
                    {coordFields.map(({ key, label }) => (
                      <EditTextField
                        key={key}
                        label={label}
                        value={draft[key] ?? ""}
                        numeric
                        compact
                        onChange={(value) => setField(key, value)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : tab === "card" ? (
              <div className={s.tabPane}>
                {params.length === 0 ? (
                  <div className={s.tabEmpty}>
                    <p>{t("components.detailsEmpty")}</p>
                  </div>
                ) : (
                  params.map(({ key, label, value }) => (
                    <div key={key} className={s.fieldRow}>
                      <span className={s.fieldLabel}>{label}</span>
                      {/* Дата внесения и дата инспекции хранятся с точностью до
                          минуты и в таком виде уходят в Excel; на экране это
                          была строка ISO во всю ширину. */}
                      <span className={s.fieldValue}>
                        {fieldValue(key, value)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : tab === "photo" ? (
              <div className={s.tabPane}>
                {photoSrc ? (
                  /* Той же плиткой, что у утечки, и тем же просмотрщиком:
                     разглядывают снимки одинаково — сводя и разводя пальцы. */
                  <div className={`${s.photoCompare} ${s.photoCompareSingle}`}>
                    <div className={s.photoCompareSlot}>
                      <button
                        type="button"
                        className={s.photoCompareThumb}
                        onClick={() => setViewerOpen(true)}
                      >
                        <img
                          className={s.photoCompareImg}
                          src={photoSrc}
                          alt={component?.component ?? ""}
                        />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={s.tabEmpty}>
                    <p>{t("components.noPhoto")}</p>
                  </div>
                )}
              </div>
            ) : tab === "coords" ? (
              <div className={s.tabPane}>
                {coords.length === 0 ? (
                  <div className={s.tabEmpty}>
                    {/* Карточка на месте, компонента на карте нет — это стоит
                        сказать прямо, а не пустой вкладкой. */}
                    <p>{t("components.noCoords.missing")}</p>
                  </div>
                ) : (
                  coords.map(({ key, label, value }) => (
                    <div key={key} className={s.fieldRow}>
                      <span className={s.fieldLabel}>{label}</span>
                      <span className={s.fieldValue}>{String(value)}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className={s.tabPane}>
                {history.length === 0 ? (
                  <div className={s.tabEmpty}>
                    <p>{t("components.historyEmpty")}</p>
                  </div>
                ) : (
                  history.map((entry, index) => (
                    <div key={`${entry.date}-${index}`} className={s.logEntry}>
                      <div className={s.logDotWrap}>
                        <span className={s.logDot}>
                          {ACTION_ICONS[entry.action] ?? "•"}
                        </span>
                        {index < history.length - 1 && (
                          <span className={s.logLine} />
                        )}
                      </div>
                      <div className={s.logBody}>
                        <span className={s.logAction}>
                          {actionLabel(entry.action)}
                        </span>
                        {entry.user && (
                          <span className={s.logUser}>{entry.user}</span>
                        )}
                        {entry.to && (
                          <span className={s.logStatus}>{entry.to}</span>
                        )}
                        {/* Прежнее значение и новое, как в истории утечки.
                            Раньше здесь стояло имя поля из кода — «medium»,
                            «scheme_tag», — и запись сообщала, что что-то
                            менялось, но не что именно. */}
                        {Array.isArray(entry.changes) &&
                          entry.changes.length > 0 && (
                            <div className={s.logChanges}>
                              {entry.changes.map((change, changeIndex) => (
                                <div
                                  key={`${change.key}-${changeIndex}`}
                                  className={s.logChange}
                                >
                                  <span className={s.logChangeLabel}>
                                    {labelOf(change.key)}
                                  </span>
                                  <span
                                    className={`${s.logChangeValue} ${s.logChangeValueBefore}`}
                                  >
                                    {formatHistoryValue(
                                      change.key,
                                      change.from,
                                      change.kind,
                                      t,
                                      lang,
                                    )}
                                  </span>
                                  <span className={s.logChangeArrow}>→</span>
                                  <span
                                    className={`${s.logChangeValue} ${s.logChangeValueAfter}`}
                                  >
                                    {formatHistoryValue(
                                      change.key,
                                      change.to,
                                      change.kind,
                                      t,
                                      lang,
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        <span className={s.logTime}>
                          {fmtDate(entry.date, lang)} ·{" "}
                          {relativeTime(entry.date, t)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className={s.actionBar}>
            {editing ? (
              <>
                <button
                  className={s.btnGhost}
                  type="button"
                  onClick={cancelEditing}
                >
                  {t("components.cancel")}
                </button>
                <button
                  className={s.btnPrimary}
                  type="button"
                  disabled={saving}
                  onClick={commit}
                >
                  {saving
                    ? t("components.buttons.saving")
                    : t("components.buttons.save")}
                </button>
              </>
            ) : confirmingRemove ? (
              <>
                <button
                  className={s.btnGhost}
                  onClick={() => setConfirmingRemove(false)}
                >
                  {t("components.cancel")}
                </button>
                <button
                  className={s.btnDangerArmed}
                  onClick={() => onRemove?.(component)}
                >
                  {t("components.removeConfirm")}
                </button>
              </>
            ) : (
              <>
                {/* Behind the reading rather than in the list, where a mis-tap
                    costs a card somebody walked out to write. Значком, как у
                    утечки: слово «Удалить» рядом с «Редактировать» читается
                    как равный по весу выбор, а он не равный. */}
                <button
                  className={s.btnDanger}
                  onClick={() => setConfirmingRemove(true)}
                  title={t("components.remove")}
                  aria-label={t("components.remove")}
                >
                  🗑
                </button>
                {canEdit && (
                  <button className={s.btnPrimary} onClick={startEditing}>
                    {t("components.edit")}
                  </button>
                )}
                <button className={s.btnGhost} onClick={onClose}>
                  {t("components.close")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
