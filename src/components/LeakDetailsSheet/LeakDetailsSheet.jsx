import { useEffect, useRef, useState, useMemo } from "react";
import { useEditablePhoto } from "../../hooks/useEditablePhoto";
import PhotoBlock from "./PhotoBlock";
import ViewBlock from "./ViewBlock";
import EditBlock from "./EditBlock";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import s from "./LeakDetailsSheet.module.scss";

/* =========================
   MODES
========================= */
const MODES = {
  VIEW: "view",
  EDIT: "edit",
};

export default function LeakDetailsSheet({ leak, onClose, onSave }) {
  const projectConfig = useProjectConfig();

  const EDIT_FIELDS = useMemo(
    () => {
      const fields = projectConfig.system.fields ?? [];
      // Фильтруем только редактируемые поля и сортируем по editOrder
      return fields
        .filter(f => f.editable !== false)
        .sort((a, b) => (a.editOrder ?? 999) - (b.editOrder ?? 999));
    },
    [projectConfig],
  );

  const [mode, setMode] = useState(MODES.VIEW);
  const [localEdit, setLocalEdit] = useState({});
  const [saving, setSaving] = useState(false);

  const prevLeakIdRef = useRef(null);
  const fileInputRef = useRef(null);

  /* =========================
     PHOTO STATE
  ========================= */
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

  /* =========================
     INIT / SYNC ON LEAK CHANGE
  ========================= */
  useEffect(() => {
    if (prevLeakIdRef.current !== leak.leak_id) {
      // инициализируем ТОЛЬКО редактируемые поля
      const editableKeys = EDIT_FIELDS.map((f) => f.key);

      setLocalEdit(
        Object.fromEntries(editableKeys.map((key) => [key, leak[key]])),
      );

      setMode(MODES.VIEW);
      resetPhoto();
      prevLeakIdRef.current = leak.leak_id;
    }
  }, [leak.leak_id, leak.updatedAt, leak, resetPhoto, EDIT_FIELDS]);

  /* =========================
     DIRTY FIELDS
  ========================= */
  const dirtyFields = useMemo(
    () => EDIT_FIELDS.filter(({ key }) => localEdit[key] !== leak[key]),
    [localEdit, leak, EDIT_FIELDS],
  );

  const isTextDirty = dirtyFields.length > 0;
  const isDirty = isPhotoDirty || isTextDirty;

  /* =========================
     SAVE
  ========================= */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const photoPath = await savePhoto();

      // patch только изменённых текстовых полей
      const textPatch = Object.fromEntries(
        dirtyFields.map(({ key }) => [key, localEdit[key]]),
      );

      onSave({
        ...leak,
        ...textPatch,
        photo: photoPath ?? leak.photo,
        updatedAt: Date.now(),
      });

      onClose();
    } catch (e) {
      alert("Ошибка сохранения");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  /* =========================
     PREVENT UNLOAD (WEB)
  ========================= */
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* =========================
     CLOSE HANDLER
  ========================= */
  const handleClose = () => {
    if (isDirty && !window.confirm("Изменения не сохранены. Закрыть?")) {
      return;
    }
    onClose();
  };

  /* =========================
     RENDER
  ========================= */
  return (
    <div className={s.detailsOverlay} onClick={handleClose}>
      <div className={s.detailsSheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.detailsHandle} />

        <PhotoBlock src={src} />

        {mode === MODES.VIEW ? (
          <ViewBlock
            data={{ ...leak, ...localEdit }}
            isDirty={isDirty}
            onEdit={() => setMode(MODES.EDIT)}
            onClose={handleClose}
          />
        ) : (
          <EditBlock
            localEdit={localEdit}
            setLocalEdit={setLocalEdit}
            isNative={isNative}
            changePhoto={changePhoto}
            saving={saving}
            onSave={handleSave}
            onCancel={() => {
              resetPhoto();
              setMode(MODES.VIEW);
            }}
            fileInputRef={fileInputRef}
          />
        )}
      </div>
    </div>
  );
}
