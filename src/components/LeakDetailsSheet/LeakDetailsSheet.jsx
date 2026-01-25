import { useEffect, useRef, useState } from "react";
import { useEditablePhoto } from "../../hooks/useEditablePhoto";
import PhotoBlock from "./PhotoBlock";
import ViewBlock from "./ViewBlock";
import EditBlock from "./EditBlock";
import { EDIT_FIELDS } from "./fields.config";
import s from "./LeakDetailsSheet.module.scss";

export default function LeakDetailsSheet({ leak, onClose, onSave }) {
  const [mode, setMode] = useState("view");
  const [localEdit, setLocalEdit] = useState({});
  const [saving, setSaving] = useState(false);

  const prevLeakIdRef = useRef(null);
  const fileInputRef = useRef(null);

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

  useEffect(() => {
    if (prevLeakIdRef.current !== leak.leak_id) {
      setLocalEdit({ ...leak });
      setMode("view");
      resetPhoto();
      prevLeakIdRef.current = leak.leak_id;
    }
  }, [leak, resetPhoto]);

  const isTextDirty = EDIT_FIELDS.some(
    ({ key }) => localEdit[key] !== leak[key],
  );

  const isDirty = isPhotoDirty || isTextDirty;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);

    const photoPath = await savePhoto();

    onSave({
      ...leak,
      ...localEdit,
      photo: photoPath ?? leak.photo,
      updatedAt: Date.now(),
    });

    setSaving(false);
    onClose();
  };

  return (
    <div
      className={s.detailsOverlay}
      onClick={() => {
        if (isDirty && !window.confirm("Изменения не сохранены. Закрыть?"))
          return;
        onClose();
      }}
    >
      <div className={s.detailsSheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.detailsHandle} />

        <PhotoBlock src={src} />

        {mode === "view" ? (
          <ViewBlock
            data={localEdit}
            onEdit={() => setMode("edit")}
            onClose={onClose}
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
              setMode("view");
            }}
            fileInputRef={fileInputRef}
          />
        )}
      </div>
    </div>
  );
}
