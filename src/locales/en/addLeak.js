export const addLeak = {
  pageTitle: "New leak",
  stepPrefix: "Step",
  draftBanner: {
    message: "📋 Unfinished entry available",
    restore: "Restore",
    discard: "Delete",
  },
  buttons: {
    prev: "← Back",
    next: "Next →",
    save: "💾 Save",
    saving: "Saving...",
    clearStep: "Clear step 🧽",
    clearAll: "Clear all fields 🧹",
  },
  confirm: {
    title: "Fill from previous entry?",
    description: "Some fields are empty. Copy values?",
    confirmLabel: "Copy",
    cancelLabel: "Cancel",
  },
  noCoords: {
    saved:
      "The leak was saved without coordinates: the location could not be determined. It stays findable in the database but will not appear on the map.",
  },
  validation: {
    lat: "Latitude {{lat}} is outside the allowed range [-90, 90]",
    lng: "Longitude {{lng}} is outside the allowed range [-180, 180]",
    photoReady: "Photo is not ready for saving yet. Try again in a second.",
    photoStorageError: "Photo storage is unavailable: {{reason}}",
  },

  errors: {
    userNameRequired: "Fill in the user name in the profile",
    serialNumberRequired:
      "Fill in the equipment serial number in calculation parameters",
    duplicateTag: "A leak with this tag already exists",
    photoSaveFailed: "Failed to save the photo",
    saveFailed: "Failed to save the leak",
  },

  success: {
    title: "Leak saved",
    description:
      "The record has been added to the log and is available in the database.",
    newLeak: "New leak",
    home: "Return home",
    tag: "Tag",
    component: "Component",
    leakRate: "Leak rate",
  },

  stepTitles: {
    basic: "Basic",
    mtrAndDescription: "MTR and description *",
    noteAndPhoto: "Note and photo",
  },
  fields: {
    district: {
      label: "District",
      placeholder: "e.g. Yaroslavsky",
      hint: "Administrative district where the leak was recorded",
    },
    locality: {
      label: "Locality",
      placeholder: "e.g. Yaroslavl",
      hint: "City or settlement",
    },
    address: {
      label: "Address",
      placeholder: "e.g. Lenin St, 1, apt. 1",
      hint: "Street, house, apartment",
    },
    object: {
      label: "Object",
      hint: "Object where the leak was recorded",
      placeholder_downstream: "e.g. Basement of a residential building",
      placeholder_midstream: "e.g. AVOG-1",
      placeholder_upstream: "e.g. drain line",
    },
    category: {
      label: "Category",
      hint: "Leak category",
      placeholder_downstream: "e.g. Cabinet and regulator stations",
      placeholder_upstream: "e.g. Well",
    },
    leak_id: {
      label: "Tag",
      shortLabel: "Tag",
      placeholder: "e.g. 4242",
      hint: "Unique number on the physical marker attached to the leak location",
    },
    component: {
      label: "Component",
      placeholder: "e.g. Ball valve",
      hint: "Part or unit from which the leak was recorded",
    },
    video_id: {
      label: "Video",
      shortLabel: "Video",
      placeholder: "e.g. 1042",
      hint: "Video recording number from the instrument (OGI)",
    },
    pressure: {
      label: "Pressure, atm",
      shortLabel: "Pressure",
      placeholder: "e.g. 4.5",
      hint: "Operating pressure in the pipeline, atm",
    },
    temperature: {
      label: "Temperature, °C",
      shortLabel: "Temperature",
      placeholder: "e.g. 20",
      hint: "Operating medium temperature, °C",
    },
    leak_speed: {
      label: "Leak rate, L/min",
      shortLabel: "Leak rate",
      placeholder: "e.g. 1.5",
      hint: "Measured leak rate by instrument, L/min",
    },
    field: {
      label: "MGPA",
      placeholder: "e.g. MGPA-1",
      hint: "Main gas pipeline administration",
    },
    station: {
      label: "Compressor station",
      placeholder: "e.g. CS-1",
      hint: "Name of the compressor station",
    },
    location: {
      label: "Location",
      hint: "Area where the leak was recorded",
      placeholder_midstream: "e.g. compressor hall A",
      placeholder_upstream: "e.g. well 1",
    },
    subdivision: {
      label: "Subdivision",
      placeholder: "e.g. Messoyakha UPG",
      hint: "Name of the subdivision where the leak was recorded",
    },
    deposit: {
      label: "Deposit",
      placeholder: "e.g. Messoyakhskoye",
      hint: "Name of the deposit where the leak was recorded",
    },
    leak_cause: {
      label: "Leak cause",
      placeholder: "e.g. Corrosion",
      hint: "Established or probable cause of the leak",
    },
    leak_description: {
      label: "Leak description",
      placeholder: "e.g. crack",
      hint: "Nature and location of the leak: connection type, visible damage",
    },
    technological_solution: {
      label: "Technical solution",
      shortLabel: "Solution",
      placeholder: "e.g. Inspection",
      hint: "Proposed method to fix the leak",
    },
    repair_recommendation: {
      label: "Repair plan",
      shortLabel: "Repair plan",
      placeholder: "e.g. Fix without shutdown",
      hint: "How to fix without or with equipment shutdown",
    },
    materials_equipment: {
      label: "Repair materials/equipment",
      shortLabel: "Repair materials",
      placeholder: "e.g. gasket",
      hint: "Proposed materials and equipment for repair",
    },
    actuator_type: {
      label: "Actuator type",
      placeholder: "e.g. manual",
      hint: "Manual, electric, pneumatic, etc.",
    },
    connection_type: {
      label: "Connection type",
      placeholder: "e.g. flange joint",
      hint: "Flanged, threaded, welded, etc.",
    },
    installation_type: {
      label: "Installation type",
      placeholder: "e.g. aboveground",
      hint: "Aboveground, underground, indoor, etc.",
    },
    note: {
      label: "Note",
      hint: "Any additional details: detection conditions, related defects",
    },
    photo: {
      label: "Leak photo",
    },
    date: {
      label: "Date",
    },
    detectedBy: {
      label: "Detected by",
    },
    lat: {
      label: "Latitude (X)",
    },
    lng: {
      label: "Longitude (Y)",
    },
    equipmentType: {
      label: "Leak volume measuring equipment",
    },
    serial_number: {
      label: "Equipment serial number",
    },
    uncertainty: {
      label: "Uncertainty",
    },
    repairAt: {
      label: "Repair date",
    },
    resolvedAt: {
      label: "Resolved date",
    },
    photo_repair: {
      label: "Repair photo",
    },
    photo_after: {
      label: "After repair photo",
    },
    monitoringRecords: {
      label: "Monitoring history",
    },
    roundNumber: {
      label: "Round number",
    },
    leak_speed_kg_h: {
      label: "Measured leak rate, kg/h",
    },
    temperature_K: {
      label: "Temperature, K",
    },
    flareShare: {
      label: "Gas to flare share",
    },
    utilShare: {
      label: "Gas to utilization share",
    },
    Operating_mode: {
      label: "Operating mode (days)",
    },
    Total_Annual_Methane_Loss_m3_y: {
      label: "Total annual methane loss CH4, m3/year",
    },
    Total_Annual_Methane_Loss_t_y: {
      label: "Annual methane loss CH4, t/year",
    },
    Emissions_t_CO2eq_year: {
      label: "Emissions, CO2-eq, t/year",
    },
    Emissions_kg_CO2_eq_year: {
      label: "Emissions, kg CO2, t/year",
    },
    weightedGWP: {
      label: "Global warming potential",
    },
  },
};
