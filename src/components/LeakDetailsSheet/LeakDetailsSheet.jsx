import { useEffect, useRef, useState, useMemo } from "react";
import { useEditablePhoto } from "../../hooks/useEditablePhoto";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { calculations } from "../../utils/calculations/calculations";
import { nextStatus } from "../../utils/status";
import { timeAgo } from "../../utils/timeAgo";
import { normalizeNumber } from "../../utils/normalize/normalizeNumber";
import PhotoBlock from "./components/PhotoBlock";
import ViewBlock from "./components/ViewBlock";
import EditBlock from "./components/EditBlock";
import PhotoViewer from "../PhotoViewer/PhotoViewer";
import s from "./LeakDetailsSheet.module.scss";

const MODE = { VIEW: "view", EDIT: "edit" };
const TAB  = { INFO: "info", PARAMS: "params", LOG: "log" };

export default function LeakDetailsSheet({ leak, onClose, onSave }) {
  const projectConfig = useProjectConfig();
  const { activeProject } = useProject();
  const { vars } = useProjectVars(activeProject?.id ?? null, projectConfig.vars);

  const EDIT_FIELDS = useMemo(() => {
    const fields = projectConfig.system.fields ?? [];
    return fields
      .filter((f) => f.editable !== false)
      .sort((a, b) => (a.editOrder ?? 999) - (b.editOrder ?? 999));
  }, [projectConfig]);

  const [mode, setMode]           = useState(MODE.VIEW);
  const [activeTab, setActiveTab] = useState(TAB.INFO);
  const [localEdit, setLocalEdit] = useState({});
  const [saving, setSaving]       = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const prevLeakIdRef = useRef(null);
  const fileInputRef  = useRef(null);

  /* ── Photo ── */
  const { src, isDirty: isPhotoDirty, changePhoto, savePhoto, resetPhoto, isNative } =
    useEditablePhoto({
      initialPath: leak.photo,
      leakId:      leak.leak_id,
      version:     leak.updatedAt,
    });

  /* ── Init on leak change ── */
  useEffect(() => {
    if (prevLeakIdRef.current !== leak.leak_id) {
      const keys = EDIT_FIELDS.map((f) => f.key);
      setLocalEdit(Object.fromEntries(keys.map((k) => [k, leak[k]])));
      setMode(MODE.VIEW);
      setActiveTab(TAB.INFO);
      resetPhoto();
      prevLeakIdRef.current = leak.leak_id;
    }
  }, [leak.leak_id, leak.updatedAt, leak, resetPhoto, EDIT_FIELDS]);

  /* ── Dirty tracking ── */
  const dirtyFields  = useMemo(
    () => EDIT_FIELDS.filter(({ key }) => localEdit[key] !== leak[key]),
    [localEdit, leak, EDIT_FIELDS],
  );
  const isDirty = isPhotoDirty || dirtyFields.length > 0;

  /* ── Save ── */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const photoPath  = await savePhoto();
      // Coerce numeric fields: partial strings ("3.", "-") → proper numbers
      const numericKeys = new Set(EDIT_FIELDS.filter((f) => f.numeric).map((f) => f.key));
      const textPatch  = Object.fromEntries(
        dirtyFields.map(({ key }) => [
          key,
          numericKeys.has(key) ? normalizeNumber(localEdit[key]) : localEdit[key],
        ]),
      );
      const speedKey   = "leak_speed";
      const speedChanged = dirtyFields.some(
        ({ key }) => key === speedKey && Number(localEdit[key]) !== Number(leak[key]),
      );
      const base = {
        ...leak,
        ...textPatch,
        photo: photoPath ?? leak.photo,
        updatedAt: Date.now(),
        history: [...(leak.history ?? []), { action: "edited", date: new Date().toISOString() }],
      };
      onSave(speedChanged && vars ? calculations(base, vars) : base);
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  /* ── Close guard ── */
  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty && !window.confirm("Изменения не сохранены. Закрыть?")) return;
    onClose();
  };

  /* ── Status change (instant save) ── */
  const handleStatusChange = async () => {
    const newStatus = nextStatus(leak.status);
    onSave({
      ...leak,
      status:    newStatus,
      updatedAt: Date.now(),
      history:   [...(leak.history ?? []), { action: "status_changed", to: newStatus, date: new Date().toISOString() }],
    });
  };

  /* ── Switch to edit, keep tab ── */
  const handleEdit = () => {
    if (activeTab === TAB.LOG) setActiveTab(TAB.INFO);
    setMode(MODE.EDIT);
  };

  const handleCancel = () => {
    resetPhoto();
    setMode(MODE.VIEW);
  };

  /* ── Computed for header ── */
  const status = leak.status ?? "open";
  const ago    = timeAgo(leak.id);

  /* ── Tabs config ── */
  const TABS = mode === MODE.VIEW
    ? [{ id: TAB.INFO, label: "Инфо" }, { id: TAB.PARAMS, label: "Параметры" }, { id: TAB.LOG, label: "Лог" }]
    : [{ id: TAB.INFO, label: "Основное" }, { id: TAB.PARAMS, label: "Параметры" }];

  return (
    <>
    <div className={s.overlay} onClick={handleClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>

        {/* ── Drag handle ── */}
        <div className={s.handle} />

        {/* ── Hero: photo + identity overlay ── */}
        <PhotoBlock
          src={src}
          status={status}
          identityNum={`№ ${leak.leak_id ?? leak.index ?? "—"}`}
          identityTime={ago ?? leak.date ?? ""}
          onStatusChange={mode === MODE.VIEW ? handleStatusChange : undefined}
          onView={mode === MODE.VIEW && src ? () => setViewerOpen(true) : undefined}
          onEdit={
            mode === MODE.EDIT
              ? () => (isNative ? changePhoto() : fileInputRef.current?.click())
              : null
          }
        />

        {/* ── Tab bar ── */}
        <div className={s.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${s.tab} ${activeTab === t.id ? s.tabActive : ""}`}
              onClick={() => setActiveTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className={s.tabContent} key={`${mode}-${activeTab}`}>
          {mode === MODE.VIEW ? (
            <ViewBlock
              data={{ ...leak, ...localEdit }}
              activeTab={activeTab}
              projectConfig={projectConfig}
            />
          ) : (
            <EditBlock
              localEdit={localEdit}
              setLocalEdit={setLocalEdit}
              activeTab={activeTab}
              projectConfig={projectConfig}
            />
          )}
        </div>

        {/* ── Action bar ── */}
        {mode === MODE.VIEW ? (
          <div className={s.actionBar}>
            <button className={s.btnPrimary} onClick={handleEdit}>
              ✏ Редактировать
            </button>
            <button className={s.btnGhost} onClick={handleClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <div className={s.actionBar}>
            {!isNative && (
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={changePhoto} />
            )}
            <button className={s.btnIcon} type="button"
              onClick={() => isNative ? changePhoto() : fileInputRef.current?.click()}
              title="Фото"
            >
              📷
            </button>
            <button className={s.btnGhost} type="button" onClick={handleCancel}>
              Отмена
            </button>
            <button className={s.btnPrimary} type="button" disabled={saving} onClick={handleSave}>
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        )}

      </div>
    </div>

    {viewerOpen && src && (
      <PhotoViewer src={src} onClose={() => setViewerOpen(false)} />
    )}
    </>
  );
}
