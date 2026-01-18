import { useState } from "react";

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState("");

  return (
    <div className="search-bar">
      <input
        placeholder="Поиск по номеру утечки…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
      />
      <button>🔍</button>
    </div>
  );
}
