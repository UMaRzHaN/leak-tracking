import {
  getProjectDataKey,
  getProjectDataFile,
} from "../constants/storage.constants";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

/* =========================
   PUBLIC API
========================= */
export async function saveProjectData(projectId, data) {
  if (!projectId) {
    throw new Error("saveProjectData: projectId is required");
  }

  const dataJson = JSON.stringify(data);

  try {
    if (Capacitor.isNativePlatform()) {
      await saveMobile(dataJson, projectId);
    } else {
      saveWeb(dataJson, projectId);
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`💾 Project "${projectId}" saved`);
    }

    return true;
  } catch (e) {
    console.error("[saveProjectData] Failed:", e);
    return false;
  }
}

/* =========================
   WEB
========================= */
function saveWeb(dataJson, projectId) {
  const storageKey = getProjectDataKey(projectId);
  localStorage.setItem(storageKey, dataJson);
}

/* =========================
   MOBILE
========================= */
async function saveMobile(dataJson, projectId) {
  const filePath = getProjectDataFile(projectId);

  await Filesystem.writeFile({
    path: filePath,
    data: dataJson,
    directory: Directory.Documents,
    encoding: "utf8",
  });
}
