import DatabaseOverflow from "../DatabaseOverflow/DatabaseOverflow";
import SearchFieldSelect from "../SearchFieldSelect/SearchFieldSelect";
import s from "./SearchPanel.module.scss";

export default function SearchPanel({
  search,
  setSearch,
  searchField,
  setSearchField,
  fields = [],
  resultCount,
  setSortByDistance,
  sortByDistance,
  clearDatabase,
  filteredData,
}) {
  return (
    <div className={s.wrapper}>
      <div className={s.card}>
        <div className={s.searchInput}>
          <span className={s.icon}>🔍</span>
          <input
            type="search"
            placeholder="Поиск утечки..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <SearchFieldSelect
          value={searchField}
          onChange={setSearchField}
          options={fields}
        />

        <div className={s.actions}>
          <button
            className={`${s.sortBtn} ${sortByDistance ? s.active : ""}`}
            onClick={() => setSortByDistance((v) => !v)}
          >
            {sortByDistance
              ? "📍 Отсортировать по близости"
              : "↩️ Обычный порядок"}
          </button>

          <DatabaseOverflow
            onClearDb={clearDatabase}
            filteredData={filteredData}
            actions
          />
        </div>

        <div className={s.resultCount}>Найдено записей: {resultCount}</div>
      </div>
    </div>
  );
}
