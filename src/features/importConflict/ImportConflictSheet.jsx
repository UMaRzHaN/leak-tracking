import { useLanguage } from "@/app/hooks/useLanguage";
import s from "./ImportConflictSheet.module.scss";

function pluralRecords(count, lang) {
  if (lang !== "ru") return count === 1 ? "record" : "records";
  if (count % 10 === 1 && count % 100 !== 11) return "запись";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "записи";
  }
  return "записей";
}

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
  const { lang } = useLanguage();

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <div className={s.icon}>⚠️</div>
        <h3 className={s.title}>
          {lang === "ru" ? "Проект уже существует" : "Project already exists"}
        </h3>
        <p className={s.description}>
          {lang === "ru"
            ? `«${projectName}» уже есть в приложении`
            : `"${projectName}" already exists in the app`}
          <span className={s.counts}>
            {existingProject?.leakCount ?? 0}{" "}
            {pluralRecords(existingProject?.leakCount ?? 0, lang)} → {leakCount}{" "}
            {lang === "ru" ? "в архиве" : "in archive"}
          </span>
        </p>
        <div className={s.actions}>
          <button className={`${s.btn} ${s.danger}`} onClick={onOverwrite}>
            {lang === "ru" ? "Перезаписать" : "Overwrite"}
          </button>
          <button className={`${s.btn} ${s.neutral}`} onClick={onMerge}>
            {lang === "ru" ? "Объединить" : "Merge"}
          </button>
          <button className={`${s.btn} ${s.neutral}`} onClick={onCopy}>
            {lang === "ru" ? "Создать копию" : "Create copy"}
          </button>
          <button className={`${s.btn} ${s.btnCancel}`} onClick={onCancel}>
            {lang === "ru" ? "Отмена" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
