export default function SearchPanel({
  search,
  setSearch,
  searchField,
  setSearchField,
  fields,
  resultCount,
}) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="field">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder=" "
        />
        <label>🔍 Поиск</label>
      </div>

      <div className="field field-select">
        <label>Искать по</label>
        <select
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
        <div style={{ fontSize: 13, color: "#546e7a" }}>
          Найдено записей: {resultCount}
        </div>
      )}
    </div>
  );
}
