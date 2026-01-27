import { useMemo } from "react";
import { useProjectConfig } from "../../app/settings/useProjectConfig";
import s from "./LeakDetailsSheet.module.scss";

export default function ViewBlock({ data, onEdit, onClose }) {
  const projectConfig = useProjectConfig();

  const VIEW_FIELDS = useMemo(
    () => projectConfig.system.viewFields ?? [],
    [projectConfig],
  );
  return (
    <>
      <div className={s.detailsList}>
        {VIEW_FIELDS.map(({ key, label, multiline }) => {
          const value = data[key];
          if (value == null || value === "") return null;

          return (
            <div
              key={key}
              className={`${s.detailsRow} ${multiline ? s.multiline : ""}`}
            >
              <span className={s.detailsLabel}>{label}</span>
              <span className={s.detailsValue}>{String(value)}</span>
            </div>
          );
        })}
      </div>

      <div className={s.detailsActions}>
        <button className={`${s.detailsBtn} ${s.edit}`} onClick={onEdit}>
          ✏️ Редактировать
        </button>
        <button className={`${s.detailsBtn} ${s.close}`} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </>
  );
}
