export const map = {
  noDataToExport: "No data to export",
  exportUnavailable: "Export is not available for this project",
  exportError: "Export error",
  kmlExported: "KML file exported successfully",
  noTilesToDownload: "No tiles to download",

  popup: {
    tag: "Tag No.",
    component: "Component",
    description: "Leak description",
    status: "Status",
    componentTag: "Component No.",
    schemeTag: "Drawing tag",
  },

  tilesSaved: "Saved {{total}} tiles",
  tilesFailed: "Failed to download {{failed}} tiles",
  tilesDownloaded: "downloaded {{count}}",
  tilesAlreadyCached: "cached {{count}}",
  tilesFailedPart: "failed {{count}}",
  downloadFailed: "✕ Download failed",
  downloadCancelled: "Cancelled — saved {{done}} of {{total}}",
  downloading: "Downloading {{percent}}%",
  cancelDownload: "Cancel map download",

  monitoringFilter: "Monitoring filter",
  monitoringDue: "To check",
  monitoringChecked: "Checked",
  monitoringAll: "All tags",
  heatmap: "Heatmap",
  statusFilter: "Status filter",
  priorityFilter: "Priority filter",
  nearbyLeaks: "Nearby leaks",
  all: "All",
  radiusKm: "km",
  radiusM: "m",

  sheet: {
    title: "Map filters",
    filterBy: "Filter by:",
    notSpecified: "Not specified",
    searchPlaceholder: "Search by tag number...",
    searchLabel: "Search by tag number",
    empty: "Nothing found",
  },

  kml: {
    documentName: "Leak Report",
    noRate: "No rate",
    savedToDocuments: "Saved to Documents/{{path}}",
    downloaded: "KML file downloaded successfully",
  },

  // Leaks and components are two bases of one project, and the map shows one
  // at a time: mixed pins would make neither of them countable.
  baseLeaks: "Leaks",
  baseComponents: "Assets",

  controls: {
    myLocation: "My location",
    searchLeaks: "Search leaks",
    downloadArea: "Download current area map",
    base: "Switch base: leaks or components",
  },
};
