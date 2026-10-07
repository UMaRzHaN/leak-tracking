import { usePhotoSrc } from "@/hooks/usePhotoSrc";
import { getComponentDisplayPhoto } from "@/domain/componentPhotos";

/**
 * Адрес снимка, который показывает карточка компонента: последний снимок
 * сверки, а без него — главный (см. `getComponentDisplayPhoto`). Один вход на
 * все карточки — список, лист и булавку на карте, — чтобы они не разошлись.
 *
 * @param {any} component
 */
export function useComponentPhotoSrc(component) {
  return usePhotoSrc(getComponentDisplayPhoto(component));
}
