import { PhotoRepository } from "@/repositories/PhotoRepository";
import {
  allocateUniqueLeakArchiveSegments,
  getImageMimeTypeFromExtension,
  normalizeImageExtension,
} from "@/services/archive/archivePaths";
import { fingerprintBlob } from "@/utils/blobHash";
import { logger } from "@/utils/logger";
import { resolvePhotoBlob } from "./photoArchive";

/**
 * Component photographs travelling in an archive.
 *
 * Until this existed a registry crossed to another device with every card
 * intact and every picture gone: `components.json` carried paths like
 * `idb://photo_…`, which name a record in *this* device's storage and mean
 * nothing anywhere else. The loss was silent — the card looked complete until
 * somebody tapped the thumbnail.
 *
 * The fix is the one the drawings already use: the bytes ride in a folder of
 * their own under a name a person can read, and the card's path is rewritten
 * to point at that folder. On the way back in, the bytes are written to this
 * device's photo storage and the path is rewritten again.
 *
 * A card is filed under its identity number, because that is what the walker
 * wrote on the equipment and what they will look for when they open the zip.
 */

export const COMPONENT_PHOTO_ARCHIVE_DIR = "component_photos";
const ARCHIVE_PREFIX = "zip:";

function hasLocalPhoto(entry) {
  return (
    typeof entry?.photo === "string" &&
    entry.photo !== "" &&
    !entry.photo.startsWith(ARCHIVE_PREFIX)
  );
}

function archivePathOf(value) {
  return typeof value === "string" && value.startsWith(ARCHIVE_PREFIX)
    ? value.slice(ARCHIVE_PREFIX.length)
    : null;
}

/**
 * Rewrites a registry for travel: photo bytes out into zip entries, photo
 * paths out of local storage and into archive paths.
 *
 * A card whose photo cannot be read keeps everything else and loses the key,
 * the same trade the leak export makes — one unreadable image must not cost
 * the whole walk.
 *
 * @param {Record<string, any>[]} components
 * @param {(id: string) => Promise<any>} [idbGet] web photo storage reader
 * @param {{dir?: string}} [options]
 * `paths` is the same rewriting, keyed by card id: the sheet writes a link to
 * the picture rather than the storage path nobody outside this device can
 * follow, and it needs to find one by the card it is printing.
 *
 * @returns {Promise<{components: Record<string, any>[], entries: {path: string, blob: Blob}[], paths: Record<string, string>}>}
 */
export async function buildComponentPhotoArchive(
  components,
  idbGet,
  { dir = COMPONENT_PHOTO_ARCHIVE_DIR } = {},
) {
  const list = Array.isArray(components) ? components : [];
  const segments = allocateUniqueLeakArchiveSegments(list, {
    prefix: "component",
    identity: (component) =>
      component?.component_uid || component?.scheme_tag || component?.id,
  });

  const entries = [];
  const rewritten = [];
  /** @type {Record<string, string>} */
  const paths = {};

  const pack = async (path, name) => {
    let resolved = /** @type {{blob: Blob, ext: any}|null} */ (null);
    try {
      resolved = await resolvePhotoBlob(path, idbGet);
    } catch (error) {
      logger.warn("[components] skipped an unreadable photo on export:", error);
    }
    if (!resolved) return null;
    const archivePath = `${dir}/${name}.${normalizeImageExtension(
      resolved.ext,
    )}`;
    entries.push({ path: archivePath, blob: resolved.blob });
    return archivePath;
  };

  for (const [index, component] of list.entries()) {
    if (!component || typeof component !== "object") {
      rewritten.push(component);
      continue;
    }
    let card = component;
    const path = component.photo;
    if (typeof path === "string" && path) {
      const archivePath = await pack(path, segments[index]);
      if (archivePath) {
        paths[component.id] = archivePath;
        card = { ...card, photo: `${ARCHIVE_PREFIX}${archivePath}` };
      } else {
        const { photo, ...rest } = card;
        void photo;
        card = rest;
      }
    }
    // Снимки осмотров (сверка, 6b) живут в записях истории — едут с ними.
    if (Array.isArray(card.history) && card.history.some(hasLocalPhoto)) {
      const history = [];
      for (const [entryIndex, entry] of card.history.entries()) {
        if (!hasLocalPhoto(entry)) {
          history.push(entry);
          continue;
        }
        const archivePath = await pack(
          entry.photo,
          `${segments[index]}_inspection_${entryIndex + 1}`,
        );
        if (archivePath) {
          history.push({ ...entry, photo: `${ARCHIVE_PREFIX}${archivePath}` });
        } else {
          const { photo, ...rest } = entry;
          void photo;
          history.push(rest);
        }
      }
      card = { ...card, history };
    }
    rewritten.push(card);
  }

  return { components: rewritten, entries, paths };
}

/**
 * Writes an archive's component photographs into this device's storage and
 * points the cards at them.
 *
 * Cards whose photo never made it into the archive keep the path they came
 * with; it will not resolve, but dropping it would hide the fact that a
 * picture was taken at all.
 *
 * @param {any} zip an opened JSZip
 * @param {Record<string, any>[]} components cards as read from the archive
 * @param {{id: string, folderName?: string}} project
 * @returns {Promise<Record<string, any>[]>}
 */
export async function restoreComponentPhotos(zip, components, project) {
  const list = Array.isArray(components) ? components : [];
  if (!zip || !project?.id) return list;

  const restoreOne = async (value, id) => {
    const archivePath = archivePathOf(value);
    if (!archivePath) return value;
    try {
      const entry = zip.file(archivePath);
      if (!entry) return value;
      const raw = await entry.async("blob");
      const extension = archivePath.split(".").pop();
      // A zip carries no media type; the extension is all there is, and photo
      // storage refuses a blob it cannot recognise as an image.
      const blob = raw.type?.startsWith("image/")
        ? raw
        : new Blob([raw], { type: getImageMimeTypeFromExtension(extension) });

      // Отпечаток снимка делает имя файла содержимым, а не временем: тот же
      // архив, импортированный второй раз, попадает в уже лежащий файл вместо
      // того, чтобы записать рядом его двойника. Фото утечек так хранятся
      // давно, а карточки писали новую копию на каждый импорт.
      const contentHash = await fingerprintBlob(blob).catch(() => null);
      const stored = await PhotoRepository.save(
        blob,
        {
          projectId: project.id,
          leakId: String(id),
          folderName: project.folderName,
        },
        [],
        { cleanupOldVersions: false, contentHash },
      );
      return stored || value;
    } catch (error) {
      logger.warn(
        `[components] could not restore the photo "${archivePath}":`,
        error,
      );
      return value;
    }
  };

  const restored = [];
  for (const component of list) {
    if (!component || typeof component !== "object") {
      restored.push(component);
      continue;
    }
    let card = component;
    if (archivePathOf(card.photo)) {
      card = { ...card, photo: await restoreOne(card.photo, card.id) };
    }
    // Снимки осмотров — из записей истории, тем же путём.
    if (
      Array.isArray(card.history) &&
      card.history.some((entry) => archivePathOf(entry?.photo))
    ) {
      const history = [];
      for (const entry of card.history) {
        history.push(
          archivePathOf(entry?.photo)
            ? {
                ...entry,
                photo: await restoreOne(entry.photo, `${card.id}_inspection`),
              }
            : entry,
        );
      }
      card = { ...card, history };
    }
    restored.push(card);
  }

  return restored;
}
