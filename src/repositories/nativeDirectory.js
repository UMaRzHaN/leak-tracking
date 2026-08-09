import { Filesystem } from "@capacitor/filesystem";

/*
 * Начиная с @capacitor/filesystem 8 mkdir отвергает вызов, если каталог уже
 * существует — даже с recursive: true (OS-PLUG-FILE-0010). Для «убедись, что
 * каталог есть» это успешный исход, поэтому такую ошибку глотаем, а любую
 * другую (нет прав, нет места, битый путь) пробрасываем.
 */
export function isDirectoryExistsError(error) {
  if (String(error?.code ?? "") === "OS-PLUG-FILE-0010") return true;
  return /already exists/i.test(String(error?.message ?? error));
}

/**
 * @param {string} path
 * @param {import("@capacitor/filesystem").Directory} directory
 */
export async function ensureNativeDirectory(path, directory) {
  try {
    await Filesystem.mkdir({ path, directory, recursive: true });
  } catch (error) {
    if (!isDirectoryExistsError(error)) throw error;
  }
  return path;
}
