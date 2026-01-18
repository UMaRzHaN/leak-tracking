import { useState } from "react";

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState("");

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    onSearch(v);
  };

  const handleClear = () => {
    setValue("");
    onSearch("");
  };

  return (
    <div className="search-bar">
      <input
        type="search"
        placeholder="Поиск по номеру утечки…"
        value={value}
        onChange={handleChange}
      />

      {value ? (
        <button onClick={handleClear} aria-label="Очистить поиск">
          ✕
        </button>
      ) : (
        <button aria-label="Поиск">🔍</button>
      )}
    </div>
  );
}
