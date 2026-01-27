import { getProjectDataKey, getProjectDataFile } from "../constants/storage.constants";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

export const save = async (updated, setData, projectId = "compression") => {
  setData(updated);
  const dataJson = JSON.stringify(updated);

  if (Capacitor.isNativePlatform()) {
    await saveMobileProjectData(dataJson, projectId);
  } else {
    saveWebProjectData(dataJson, projectId);
  }
};

const saveWebProjectData = (dataJson, projectId) => {
  const storageKey = getProjectDataKey(projectId);
  localStorage.setItem(storageKey, dataJson);
  console.log(`💾 [WEB] Данные проекта "${projectId}" сохранены`);
};

const saveMobileProjectData = async (dataJson, projectId) => {
  try {
    const dataFile = getProjectDataFile(projectId);
    await Filesystem.writeFile({
      path: dataFile,
      data: dataJson,
      directory: Directory.Documents,
      encoding: "utf8",
    });
    console.log(`💾 [MOBILE] Данные проекта "${projectId}" сохранены`);
  } catch (e) {
    console.error("Error saving mobile project data:", e);
  }
};

