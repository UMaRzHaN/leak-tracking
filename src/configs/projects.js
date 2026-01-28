import upstream from "./upstream/upstream.config";
import midstream from "./midstream/midstream.config";
import downstream from "./downstream/downstream.config";

export const PROJECTS = {
  upstream,
  midstream,
  downstream,
};

export const PROJECT_META = {
  upstream: {
    title: "Upstream",
    description: "Добыча",
    folder: "Upstream",
  },
  midstream: {
    title: "Midstream",
    description: "Транспортировка и хранение",
    folder: "Midstream",
  },
  downstream: {
    title: "Downstream",
    description: "Переработка и сбыт",
    folder: "Downstream",
  },
};
