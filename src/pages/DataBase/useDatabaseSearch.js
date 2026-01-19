import { useState, useMemo } from "react";

export const SEARCH_FIELDS = [
  { key: "all", label: "По всем полям" },
  { key: "leak_id", label: "Индивидуальный номер утечки (бирка)" },
  { key: "video_id", label: "Индивидуальный номер видео" },
  { key: "station", label: "Компрессорная станция" },
  { key: "location", label: "Локация" },
  { key: "object", label: "Объект" },
  { key: "component", label: "Компонент" },
  { key: "leak_description", label: "Описание утечки" },
  { key: "leak_cause", label: "Причина утечки" },
  { key: "technological_solution", label: "Технологическое решение" },
  { key: "repair_recommendation", label: "Решение / План устранения" },
  { key: "materials_equipment", label: "МТР ремонта" },
  { key: "note", label: "Примечание" },
];

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
