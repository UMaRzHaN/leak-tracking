import compression from "./compression/compressions.config";
import processing from "./processing/processings.config";
import wells from "./wells/wells.config";
import primary from "./primary_gas_treatment_transport/primary_gas_treatment_transport.config";

export const PROJECTS = {
  compression,
  processing,
  wells,
  primary,
};

export const PROJECT_META = {
  compression: {
    title: "Compression Stations",
    description: "КС, компрессорные агрегаты",
    folder: "Compression_Stations",
  },
  processing: {
    title: "Gas Processing",
    description: "Установки подготовки газа",
    folder: "Gas_Processing",
  },
  wells: {
    title: "Wells",
    description: "Скважины",
    folder: "Wells",
  },
  primary: {
    title: "Primary Gas Treatment & Transport",
    description: "Первичная подготовка и транспорт",
    folder: "Primary_Gas_Treatment_Transport",
  },
};
