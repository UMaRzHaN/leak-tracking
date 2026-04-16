import s from "./UndoToast.module.scss";

/**
 * Props:
 *  pending  — { id, label } | null
 *  onUndo   — function
 */
export default function UndoToast({ pending, onUndo }) {
  if (!pending) return null;

  return (
    <div className={s.toast} role="status">
      <span className={s.msg}>
        Запись <strong>«{pending.label}»</strong> удалена
      </span>
      <button className={s.undoBtn} type="button" onClick={onUndo}>
        Отменить
      </button>
    </div>
  );
}
