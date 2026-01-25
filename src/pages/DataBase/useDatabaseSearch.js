import { useState, useMemo } from "react";
import { SEARCH_FIELDS } from "../../configs/compression/constants.config";


export function useDatabaseSearch(data) {
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all");

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();

    return data.filter((row) => {
      if (searchField === "all") {
        return SEARCH_FIELDS
          .filter((f) => f.key !== "all")
          .some(({ key }) =>
            row[key]?.toString().toLowerCase().includes(q)
          );
      }
      return row[searchField]?.toString().toLowerCase().includes(q);
    });
  }, [data, search, searchField]);

  return {
    search,
    setSearch,
    searchField,
    setSearchField,
    filteredData,
    fields: SEARCH_FIELDS, // ✅ ВАЖНО
  };
}
