import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useEditablePhoto } from "../../hooks/useEditablePhoto";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useProject } from "../../app/settings/ProjectContext";
import { useProjectVars } from "../../app/settings/useProjectVars";
import { calculations } from "../../utils/calculations/calculations";
import { nextStatus, STATUS } from "../../utils/status";
import { priorityFromSpeed } from "../../utils/priority";
import { timeAgo } from "../../utils/timeAgo";
import { normalizeNumber } from "../../utils/normalize/normalizeNumber";
import { hapticWarning } from "../../utils/haptics";
import PhotoBlock from "./components/PhotoBlock";
import ViewBlock from "./components/ViewBlock";
import EditBlock from "./components/EditBlock";
import PhotoViewer from "../PhotoViewer/PhotoViewer";
import ResolveModal from "../ResolveModal/ResolveModal";
import s from "./LeakDetailsSheet.module.scss";

const DELETE_ARM_MS = 3000;

const MODE = { VIEW: "view", EDIT: "edit" };
const TAB = { INFO: "info", PARAMS: "params", COORDS: "coords", LOG: "log" };

export default function LeakDetailsSheet({ leak, onClose, onSave, onDelete }) {
  const projectConfig = useProjectConfig();
  const { activeProject } = useProject();
  const { vars } = useProjectVars(
    activeProject?.id ?? null,
    projectConfig.vars,
  );

  const EDIT_FIELDS = useMemo(() => {
    const fields = projectConfig.system.fields ?? [];
    return fields
      .filter((f) => f.editable !== false)
      .sort((a, b) => (a.editOrder ?? 999) - (b.editOrder ?? 999));
  }, [projectConfig]);

  const [mode, setMode] = useState(MODE.VIEW);
  const [activeTab, setActiveTab] = useState(TAB.INFO);
  const [localEdit, setLocalEdit] = useState({});
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  const prevLeakIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const deleteTimerRef = useRef(null);

  /* ── Photo ── */
  const {
    src,
    isDirty: isPhotoDirty,
    changePhoto,
    savePhoto,
    resetPhoto,
    isNative,
  } = useEditablePhoto({
    initialPath: leak.photo,
    leakId: leak.leak_id,
    version: leak.updatedAt,
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
  const dirtyFields = useMemo(
    () => EDIT_FIELDS.filter(({ key }) => localEdit[key] !== leak[key]),
    [localEdit, leak, EDIT_FIELDS],
  );
  const isDirty = isPhotoDirty || dirtyFields.length > 0;

  /* ── Save ── */
  const handleSave = async () => {
    if (saving) return;

    const lat = Number(localEdit.lat ?? leak.lat);
    const lng = Number(localEdit.lng ?? leak.lng);
    if (Number.isFinite(lat) && (lat < -90 || lat > 90)) {
      alert(`Широта ${lat} вне допустимого диапазона [-90, 90]`);
      return;
    }
    if (Number.isFinite(lng) && (lng < -180 || lng > 180)) {
      alert(`Долгота ${lng} вне допустимого диапазона [-180, 180]`);
      return;
    }

    setSaving(true);
    try {
      const photoPath = await savePhoto();
      // Coerce numeric fields: partial strings ("3.", "-") → proper numbers
      const numericKeys = new Set(
        EDIT_FIELDS.filter((f) => f.numeric).map((f) => f.key),
      );
      const textPatch = Object.fromEntries(
        dirtyFields.map(({ key }) => [
          key,
          numericKeys.has(key)
            ? normalizeNumber(localEdit[key])
            : localEdit[key],
        ]),
      );
      const speedKey = "leak_speed";
      const speedChanged = dirtyFields.some(
        ({ key }) =>
          key === speedKey && Number(localEdit[key]) !== Number(leak[key]),
      );
      const base = {
        ...leak,
        ...textPatch,
        photo: photoPath ?? leak.photo,
        updatedAt: Date.now(),
        history: [
          ...(leak.history ?? []),
          { action: "edited", date: new Date().toISOString() },
        ],
      };
      const withCalc = speedChanged && vars ? calculations(base, vars) : base;
      // recalculate priority whenever leak_speed changes
      const withPriority = speedChanged
        ? { ...withCalc, priority: priorityFromSpeed(localEdit[speedKey]) }
        : withCalc;
      onSave(withPriority);
    } catch {
      alert("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  /* ── Close guard ── */
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty && !window.confirm("Изменения не сохранены. Закрыть?")) return;
    onClose();
  };

  /* ── Status change (instant save, or open resolve modal) ── */
  const handleStatusChange = () => {
    const newStatus = nextStatus(leak.status);
    if (newStatus === STATUS.RESOLVED) {
      setResolveOpen(true);
      return;
    }
    onSave({
      ...leak,
      status: newStatus,
      updatedAt: Date.now(),
      history: [
        ...(leak.history ?? []),
        {
          action: "status_changed",
          to: newStatus,
          date: new Date().toISOString(),
        },
      ],
    });
  };

  const handleResolveConfirm = ({ photo_after, materials_equipment, note }) => {
    setResolveOpen(false);
    const now = new Date().toISOString();
    onSave({
      ...leak,
      status: STATUS.RESOLVED,
      resolvedAt: Date.now(),
      photo_after: photo_after ?? leak.photo_after,
      materials_equipment: materials_equipment ?? leak.materials_equipment,
      note: note ?? leak.note,
      updatedAt: Date.now(),
      history: [
        ...(leak.history ?? []),
        { action: "status_changed", to: STATUS.RESOLVED, date: now },
      ],
    });
  };

  /* ── Priority change (instant save) ── */
  const handlePriorityChange = (priority) => {
    onSave({ ...leak, priority, updatedAt: Date.now() });
  };

  /* ── Add comment to history ── */
  const handleAddComment = (text) => {
    onSave({
      ...leak,
      updatedAt: Date.now(),
      history: [
        ...(leak.history ?? []),
        { action: "comment", text, date: new Date().toISOString() },
      ],
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

  /* ── Delete (two-step) ── */
  const armDelete = useCallback(() => {
    hapticWarning();
    setDeleteArmed(true);
    deleteTimerRef.current = setTimeout(
      () => setDeleteArmed(false),
      DELETE_ARM_MS,
    );
  }, []);

  const confirmDelete = useCallback(() => {
    clearTimeout(deleteTimerRef.current);
    setDeleteArmed(false);
    onDelete?.(leak.id);
  }, [leak.id, onDelete]);

  const disarmDelete = useCallback(() => {
    clearTimeout(deleteTimerRef.current);
    setDeleteArmed(false);
  }, []);

  // Disarm when sheet closes or mode changes
  useEffect(() => () => clearTimeout(deleteTimerRef.current), []);
  useEffect(() => {
    if (mode !== MODE.VIEW) disarmDelete();
  }, [mode, disarmDelete]);

  /* ── Computed for header ── */
  const status = leak.status ?? "open";
  const ago = timeAgo(leak.id);

  /* ── Tabs config ── */
  const TABS =
    mode === MODE.VIEW
      ? [
          { id: TAB.INFO, label: "Инфо" },
          { id: TAB.PARAMS, label: "Параметры" },
          { id: TAB.COORDS, label: "Координаты" },
          { id: TAB.LOG, label: "Лог" },
        ]
      : [
          { id: TAB.INFO, label: "Основное" },
          { id: TAB.PARAMS, label: "Параметры" },
          { id: TAB.COORDS, label: "Координаты" },
        ];

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
            onView={
              mode === MODE.VIEW && src ? () => setViewerOpen(true) : undefined
            }
            onEdit={
              mode === MODE.EDIT
                ? () =>
                    isNative ? changePhoto() : fileInputRef.current?.click()
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
                onAddComment={handleAddComment}
                onPriorityChange={handlePriorityChange}
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
              {onDelete &&
                (deleteArmed ? (
                  <button
                    className={s.btnDangerArmed}
                    type="button"
                    onClick={confirmDelete}
                  >
                    <span>Удалить?</span>
                    <span className={s.btnDangerProgress} />
                  </button>
                ) : (
                  <button
                    className={s.btnDanger}
                    type="button"
                    onClick={armDelete}
                    title="Удалить утечку"
                  >
                    🗑
                  </button>
                ))}
              <button className={s.btnPrimary} onClick={handleEdit}>
                Редактировать
              </button>
              <button className={s.btnGhost} onClick={handleClose}>
                Закрыть
              </button>
            </div>
          ) : (
            <div className={s.actionBar}>
              {!isNative && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={changePhoto}
                />
              )}
              <button
                className={s.btnIcon}
                type="button"
                onClick={() =>
                  isNative ? changePhoto() : fileInputRef.current?.click()
                }
                title="Фото"
              >
                📷
              </button>
              <button
                className={s.btnGhost}
                type="button"
                onClick={handleCancel}
              >
                Отмена
              </button>
              <button
                className={s.btnPrimary}
                type="button"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          )}
        </div>
      </div>

      {viewerOpen && src && (
        <PhotoViewer src={src} onClose={() => setViewerOpen(false)} />
      )}

      {resolveOpen && (
        <ResolveModal
          leak={leak}
          onConfirm={handleResolveConfirm}
          onClose={() => setResolveOpen(false)}
        />
      )}
    </>
  );
}
