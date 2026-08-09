export const PROJECT_LOCATION_CONFIG = {
  upstream: {
    main: "subdivision",
    secondary: "deposit",
    last: "location",
    label: "Месторождение",
    main_label: "Подразделение",
  },
  midstream: {
    main: "field",
    secondary: "station",
    last: "location",
    label: "Станция",
    main_label: "УМГ",
  },
  // Населённый пункт стоит выше района: распределительные сети городские, а
  // город делится на районы, не наоборот. Обратный порядок строил проводник
  // объектов вверх ногами.
  downstream: {
    main: "locality",
    secondary: "district",
    last: "address",
    label: "Район",
    main_label: "Населённый пункт",
  },
};
