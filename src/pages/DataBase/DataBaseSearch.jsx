import SearchPanel from "../../components/SearchPanel/SearchPanel";

export default function DataBaseSearch({
  search,
  setSearch,
  searchField,
  setSearchField,
  sortByDistance,
  setSortByDistance,
  filteredData,
  sortedData,
  coords,
  clearDatabase,
  fields,
}) {
  return (
    <SearchPanel
      search={search}
      setSearch={setSearch}
      searchField={searchField}
      setSearchField={setSearchField}
      resultCount={sortedData.length}
      setSortByDistance={setSortByDistance}
      sortByDistance={sortByDistance}
      clearDatabase={clearDatabase}
      filteredData={filteredData}
      coords={coords}
      fields={fields}
    />
  );
}
