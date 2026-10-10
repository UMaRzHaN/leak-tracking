import { useEffect, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import Icon from "@/components/ui/Icon/Icon";
import s from "../Settings.module.scss";

/**
 * Карточка текущего проекта. Настройки описывают только его: список всех
 * проектов живёт в меню, там же их переключают и добавляют. Здесь —
 * название, тип, Sync ID, папка и объекты. Удаление — в опасной зоне.
 */
export default function ActiveProjectCard({
  project,
  objectsCount,
  onOpenObjects,
  onRename,
  onChangeSyncId,
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);

  useEffect(() => {
    setName(project.name);
    setEditing(false);
  }, [project.id, project.name]);

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) onRename(trimmed);
    else setName(project.name);
    setEditing(false);
  };

  const typeTitle = t(`settings.projectTypes.${project.type}`);

  return (
    <div className={s.groupCard}>
      {editing ? (
        <div className={s.groupRow}>
          <input
            className={s.projectNameInput}
            value={name}
            autoFocus
            aria-label={t("settings.objects.name")}
            onChange={(event) => setName(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setName(project.name);
                setEditing(false);
              }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className={`${s.groupRow} ${s.groupRowButton}`}
          onClick={() => setEditing(true)}
          title={t("settings.rename")}
        >
          <span className={s.groupRowText}>
            <strong>{t("settings.objects.name")}</strong>
          </span>
          <span className={s.objectsCount}>{project.name}</span>
          <Icon name="edit" size={15} strokeWidth={1.8} />
        </button>
      )}

      <div className={s.groupRow}>
        <span className={s.groupRowText}>
          <strong>{t("settings.projectType")}</strong>
        </span>
        <span className={s.objectsCount}>{typeTitle}</span>
      </div>

      <button
        type="button"
        className={`${s.groupRow} ${s.groupRowButton}`}
        onClick={onChangeSyncId}
        title={t("settings.changeSyncId")}
      >
        <span className={s.groupRowText}>
          <strong>Sync ID</strong>
          <small className={s.mono}>
            {project.syncId || t("settings.notCreatedYet")}
          </small>
        </span>
        <span className={s.groupLink}>{t("settings.change")}</span>
      </button>

      <div className={s.groupRow}>
        <span className={s.groupRowText}>
          <strong>{t("settings.folder")}</strong>
          <small className={s.mono}>{project.folderName}</small>
        </span>
      </div>

      <button
        type="button"
        className={`${s.groupRow} ${s.groupRowButton}`}
        onClick={onOpenObjects}
      >
        <span className={s.groupRowText}>
          <strong>{t("settings.objects.title")}</strong>
        </span>
        <span className={s.objectsCount}>
          {t("settings.objects.count", { count: objectsCount })}
        </span>
        <Icon name="chevronRight" size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
