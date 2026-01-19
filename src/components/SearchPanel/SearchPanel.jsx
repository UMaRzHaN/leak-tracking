import DatabaseOverflow from "../DatabaseOverflow/DatabaseOverflow";

export default function SearchPanel({
  search,
  setSearch,
  searchField,
  setSearchField,
  fields,
  resultCount,
  setSortByDistance,
  sortByDistance,
  clearDatabase,
  filteredData,
}) {
  return (
    <div className="search-panel">
      {/* Search input */}
      <div className="search-input">
        <span className="search-icon">🔍</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск утечки..."
        />
      </div>

      {/* Filters */}
      <div className="filter-chips">
        <select
          id="select"
          className="chip"
          value={searchField}
          onChange={(e) => setSearchField(e.target.value)}
        >
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSortByDistance((v) => !v)}
          className={`sort-btn ${sortByDistance ? "active" : ""}`}
        >
          {sortByDistance
            ? "↩️ Обычный порядок"
            : "📍 Отсортировать по близости"}
        </button>
        <DatabaseOverflow
          onClearDb={clearDatabase}
          filteredData={filteredData}
          actions
        />
      </div>

      {typeof resultCount === "number" && (
        <div className="result-count">Найдено записей: {resultCount}</div>
      )}
    </div>
  );
}
