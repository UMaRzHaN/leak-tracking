import s from "@/pages/MainPage/MainPage.module.scss";

export default function EmptyState({ setPage, hasFilter }) {
  return (
    <div className={s.empty}>
      <span className={s.emptyIcon}>{hasFilter ? "🔍" : "📋"}</span>
      <p className={s.emptyTitle}>
        {hasFilter ? "Нет записей с таким статусом" : "Записей пока нет"}
      </p>
      {!hasFilter && (
        <>
          <p className={s.emptyHint}>Добавьте первую утечку через кнопку + внизу</p>
          <button className={s.emptyBtn} onClick={() => setPage("add")}>
            + Добавить утечку
          </button>
        </>
      )}
    </div>
  );
}
