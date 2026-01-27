import EditTextField from "../EditTextField/EditTextField";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import { useMemo } from "react";
import s from "./LeakDetailsSheet.module.scss";

export default function EditBlock({
  localEdit,
  setLocalEdit,
  isNative,
  changePhoto,
  saving,
  onSave,
  onCancel,
  fileInputRef,
}) {
  const projectConfig = useProjectConfig();

  const EDIT_FIELDS = useMemo(
    () => projectConfig.system.editFields ?? [],
    [projectConfig],
  );
  return (
    <div className={s.editBlock}>
      {EDIT_FIELDS.map(({ key, label, multiline }) => (
        <EditTextField
          key={key}
          label={label}
          multiline={multiline}
          value={localEdit[key] ?? ""}
          onChange={(v) => setLocalEdit((prev) => ({ ...prev, [key]: v }))}
        />
      ))}

      {!isNative && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={changePhoto}
        />
      )}

      <div className={s.detailsActions}>
        <button
          className={`${s.detailsBtn} ${s.editPhoto}`}
          onClick={() =>
            isNative ? changePhoto() : fileInputRef.current?.click()
          }
        >
          📷 Изменить фото
        </button>

        <button
          disabled={saving}
          className={`${s.detailsBtn} ${s.edit}`}
          onClick={onSave}
        >
          💾 Сохранить
        </button>

        <button className={`${s.detailsBtn} ${s.close}`} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}
