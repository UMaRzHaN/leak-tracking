const STORAGE_KEY = "leaks_database_v1";
export const save = (updated, setData) => {
  setData(updated);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};
