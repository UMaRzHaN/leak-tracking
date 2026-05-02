import s from "./ImportConflictSheet.module.scss";

export default function ImportConflictSheet({
  open,
  projectName,
  existingProject,
  leakCount,
  onOverwrite,
  onMerge,
  onCopy,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <div className={s.icon}>⚠️</div>
        <h3 className={s.title}>Проект уже существует</h3>
        <p className={s.description}>
          «{projectName}» уже есть в приложении
          <span className={s.counts}>
            {existingProject?.leakCount ?? 0} записей → {leakCount} в архиве
          </span>
        </p>
        <div className={s.actions}>
          <button className={`${s.btn} ${s.danger}`} onClick={onOverwrite}>
            Перезаписать
          </button>
          <button className={`${s.btn} ${s.neutral}`} onClick={onMerge}>
            Объединить
          </button>
          <button className={`${s.btn} ${s.neutral}`} onClick={onCopy}>
            Создать копию
          </button>
          <button className={`${s.btn} ${s.btnCancel}`} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
