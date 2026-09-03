export const excelExport = {
  sheets: {
    leaks: "Leaks",
    history: "Leak History",
    monitoring: "Monitoring",
    repairs: "Repairs",
  },

  photo: {
    open: "Open photo",
    missing: "Present (file missing)",
  },

  history: {
    unknownUser: "Unknown",
    headers: {
      index: "No.",
      leak_id: "Tag",
      date: "Date",
      time: "Time",
      action: "Action",
      user: "User",
      text: "Text",
      to: "Status",
      changes: "Changes JSON",
    },
  },

  repairs: {
    headers: {
      index: "#",
      leak_id: "Tag",
      attempt: "Attempt",
      repairAt: "Started",
      repairTime: "Start time",
      resolvedAt: "Finished",
      resolvedTime: "Finish time",
      durationHours: "Hours to repair",
      user: "Performed by",
      materials_equipment: "Materials",
      note: "Note",
      repairPhoto: "Start photo",
      donePhoto: "Finish photo",
    },
  },

  monitoring: {
    headers: {
      index: "No.",
      leak_id: "Tag",
      roundNumber: "Round",
      date: "Monitoring date",
      time: "Monitoring time",
      monitoredBy: "Monitored by",
      result: "Leak present",
      materials_equipment: "Materials",
      comment: "Comment",
      photo: "Monitoring photo",
      previousPhoto: "Previous photo",
    },
    answers: {
      still_leaking: "Yes",
      needs_recheck: "Under repair",
      resolved: "No",
    },
  },

  backup: {
    title: "Project backup",
    note: "The summary is for reference. Restore data is stored in hidden system columns.",
    fieldColumn: "Field",
    valueColumn: "Value",
    roundNumberFormat: '"No. "0',
    projectTypes: {
      upstream: "Upstream",
      midstream: "Midstream",
      downstream: "Downstream",
    },
    summary: {
      project: "Project",
      projectType: "Project type",
      exportedAt: "Exported at",
      leaks: "Leaks",
      monitoringChecks: "Monitoring checks",
      historyRecords: "History records",
      currentRound: "Current round",
      checkedInRound: "Checked in current round",
      totalInRound: "Total in current round",
      remainingInRound: "Remaining to check",
      schemaVersion: "Backup schema",
    },
  },

  archiveExported: "Excel project archive exported ({{fileName}})",
  saved: "Saved to Documents/{{path}}",
  downloaded: "File exported ({{fileName}})",
};
