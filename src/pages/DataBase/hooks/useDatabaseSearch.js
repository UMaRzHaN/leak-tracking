import { useState, useMemo } from "react";
import { useProjectConfig } from "../../../app/settings/useProjectConfig";

export function useDatabaseSearch(data) {
  const projectConfig = useProjectConfig();

  const SEARCH_FIELDS = useMemo(
    () => projectConfig?.system?.search ?? [],
    [projectConfig],
  );

  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("all");

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();

    return data.filter((row) => {
      if (searchField === "all") {
        return SEARCH_FIELDS.filter((f) => f.key !== "all").some(({ key }) =>
          row[key]?.toString().toLowerCase().includes(q),
        );
      }

      return row[searchField]
        ?.toString()
        .toLowerCase()
        .includes(q);
    });
  }, [data, search, searchField, SEARCH_FIELDS]);

  return {
    search,
    setSearch,
    searchField,
    setSearchField,
    filteredData,
    fields: SEARCH_FIELDS, // ✅ теперь project-aware
  };
}
