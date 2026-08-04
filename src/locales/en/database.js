export const database = {
  bulkRecalcTitle: "Bulk recalculation",
  bulkRecalcDescription:
    "The first selected record's parameters will be applied to {{count}} records.",
  apply: "Apply",

  changeSortOrder: "Change sort order",
  dateAsc: "date ↑",
  dateDesc: "date ↓",
  clearAll: "Clear all",
  selectAll: "Select all",
  exportZip: "Export to Excel + photos (ZIP)",
  exporting: "Export...",
  exportInProgress: "Export in progress, please wait...",
  clearSelection: "Clear selection",
  check: "Check",
  editCalcParamsForSelected: "Edit calculation parameters for selected records",
  calcParams: "Calculation parameters",

  notSpecified: "Not specified",
  radiusKm: "km",
  radiusM: "m",
  searchPlaceholder: "Tag, location, object, description, inspector...",
  searchLeaks: "Search leaks",
  clearSearch: "Clear search",
  filters: "Filters",
  status: "Status",
  priority: "Priority",
  all: "All",
  nearbyRadius: " • within {{radius}} m",
  selectedOf: "{{selected}} selected of {{visible}}",
  nearMe: "Near me",

  locationLabels: {
    subdivision: "Subdivision",
    field: "MGPA",
    district: "District",
    deposit: "Deposit",
    station: "Station",
    locality: "Locality",
    location: "Location",
  },

  fillUserName: "Fill in the user name in the profile",
  paramsAlreadyApplied: "Selected parameters are already applied",
  paramsUpdated: "Parameters and calculations updated: {{changed}}",
  paramsUpdateFailed: "Failed to update parameters: {{message}}",

  bulk: {
    statusChanged: "Status changed for {{count}} {{records}}",
    resolved: "Resolved {{count}} {{records}}",
    saveError: "Save error: {{message}}",
    records: {
      one: "record",
      few: "records",
      many: "records",
      other: "records",
    },
  },

  export: {
    hasPhoto: "Yes",
    success: "ZIP archive downloaded successfully",
    error: "Export error: {{message}}",
  },
};
