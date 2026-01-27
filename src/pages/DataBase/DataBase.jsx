import { useState } from "react";

import DataBaseSearch from "./components/DataBaseSearch";
import DataBaseList from "./components/DataBaseList";

import LeakDetailsSheet from "../../components/LeakDetailsSheet/LeakDetailsSheet";

import { useDatabaseSearch, useDatabaseSort, useDatabaseActions } from "./";

export default function DataBase({ data, setData, coords, clearDatabase }) {
  const [activeLeak, setActiveLeak] = useState(null);

  const {
    search,
    setSearch,
    searchField,
    setSearchField,
    filteredData,
    fields,
  } = useDatabaseSearch(data);

  const { sortedData, sortByDistance, setSortByDistance } = useDatabaseSort(
    filteredData,
    coords,
  );

  const { remove, saveLeak } = useDatabaseActions(data, setData);

  return (
    <div className="card">
      <DataBaseSearch
        search={search}
        setSearch={setSearch}
        searchField={searchField}
        setSearchField={setSearchField}
        sortByDistance={sortByDistance}
        setSortByDistance={setSortByDistance}
        filteredData={filteredData}
        sortedData={sortedData}
        coords={coords}
        clearDatabase={clearDatabase}
        fields={fields}
      />

      <DataBaseList
        data={sortedData}
        onRemove={remove}
        onOpenDetails={setActiveLeak}
      />

      {activeLeak && (
        <LeakDetailsSheet
          leak={activeLeak}
          onClose={() => setActiveLeak(null)}
          onSave={(updatedLeak) => {
            saveLeak(updatedLeak);
            setActiveLeak(null);
          }}
        />
      )}
    </div>
  );
}
