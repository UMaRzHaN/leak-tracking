import { dataUrlToBlob } from "@/utils/photoConversion";

/**
 * Годится ли снимок к сохранению — включая восстановленный из черновика.
 *
 * В форме снимок держится объектом: `raw` — сам файл, `src` — предпросмотр. В
 * черновик кладётся только `src`, потому что blob в localStorage не положишь, —
 * и восстановленный снимок приходит без `raw`. Проверять на `raw` значит
 * объявлять такой снимок отсутствующим: человек видит фотографию на экране, а
 * форма отказывается сохраняться и не говорит почему.
 *
 * Поэтому `src` признаётся достаточным, если из него получается картинка.
 * Пересборкой blob'а занимаются сами формы при сохранении (`extractPhotoBlob`
 * у карточки, `dataUrlToBlob` у утечки).
 */
export function hasRestorablePhoto(photo) {
  if (!photo?.src) return false;
  if (photo.raw) return true;
  try {
    return Boolean(
      dataUrlToBlob(photo.src)?.type?.toLowerCase().startsWith("image/"),
    );
  } catch {
    return false;
  }
}
