import "./SearchPanel.css";

export default function SearchPanel({
  search,
  setSearch,
  searchField,
  setSearchField,
  fields,
  resultCount,
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
      </div>

      {typeof resultCount === "number" && (
        <div className="result-count">Найдено записей: {resultCount}</div>
      )}
    </div>
  );
}
