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
  validation: {
    lat: "Latitude {{lat}} is outside the allowed range [-90, 90]",
    lng: "Longitude {{lng}} is outside the allowed range [-180, 180]",
    photoReady: "Photo is not ready for saving yet. Try again in a second.",
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
      placeholder: "e.g. Basement of a residential building",
      hint: "Object where the leak was recorded",
    },
    category: {
      label: "Category",
      placeholder: "e.g. Cabinet and regulator stations",
      hint: "Leak category",
    },
    leak_id: {
      label: "Tag",
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
      placeholder: "e.g. 1042",
      hint: "Video recording number from the instrument (OGI)",
    },
    pressure: {
      label: "Pressure, atm",
      placeholder: "e.g. 4.5",
      hint: "Operating pressure in the pipeline, atm",
    },
    temperature: {
      label: "Temperature, °C",
      placeholder: "e.g. 20",
      hint: "Operating medium temperature, °C",
    },
    leak_speed: {
      label: "Leak rate, L/min",
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
      placeholder: "e.g. workshop A of compressor units",
      hint: "Area where the leak was recorded",
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
      placeholder: "e.g. Inspection",
      hint: "Proposed method to fix the leak",
    },
    repair_recommendation: {
      label: "Repair plan",
      placeholder: "e.g. Fix without shutdown",
      hint: "How to fix without or with equipment shutdown",
    },
    materials_equipment: {
      label: "Repair materials/equipment",
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
  },
};
