import { useState } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { usePhotoRequirements } from "@/app/project/hooks/usePhotoRequirements";
import { recordComponentInspected } from "@/domain/componentHistory";
import ComponentCheckScreen from "./ComponentCheckScreen";

/**
 * Снимок осмотра — в хранилище фото, путь — в запись истории. Своим именем,
 * а не именем карточки: главный снимок карточки осмотр не заменяет.
 *
 * @param {any} card
 * @param {{ status: string, comment?: string, photo?: any, coords?: any }} draft
 * @param {{ savePhoto: Function, user?: string, roundNumber?: number }} options
 */
export async function applyComponentCheck(
  card,
  draft,
  { savePhoto, user, roundNumber },
) {
  let photo;
  if (draft.photo?.raw) {
    const stored = await savePhoto(
      draft.photo.raw,
      `${card.id}_inspection`,
      [],
      {
        cleanupOldVersions: false,
      },
    );
    photo = typeof stored === "string" ? stored : stored?.path;
    if (!photo) {
      const error = new Error("Photo storage refused the write");
      /** @type {any} */ (error).code = "COMPONENT_PHOTO_SAVE_FAILED";
      throw error;
    }
  }
  return recordComponentInspected(card, {
    status: draft.status,
    user,
    roundNumber,
    photo,
    comment: draft.comment,
    coords: draft.coords,
  });
}

/**
 * Осмотр компонента экраном (6b): «Сверка» и одиночный осмотр в базе
 * компонентов открывают один и тот же экран и сохраняют одинаково.
 *
 * @param {{
 *   project: any,
 *   updateComponent: (id: string, card: any) => Promise<any>,
 *   userProfile?: { name?: string },
 *   roundNumber?: () => number|undefined,
 *   onSaved?: (card: any) => void,
 *   onError?: (error: unknown) => void,
 * }} options
 */
export function useComponentCheck({
  project,
  updateComponent,
  userProfile,
  roundNumber = () => undefined,
  onSaved,
  onError,
}) {
  const { savePhoto } = usePhotoStorage();
  const { reconcilePhotoRequired } = usePhotoRequirements(project?.id ?? null);
  const [card, setCard] = useState(/** @type {any} */ (null));
  const [saving, setSaving] = useState(false);

  const save = async (draft) => {
    if (!card) return;
    setSaving(true);
    try {
      const next = await applyComponentCheck(card, draft, {
        savePhoto,
        user: userProfile?.name,
        roundNumber: roundNumber(),
      });
      await updateComponent(card.id, next);
      setCard(null);
      onSaved?.(next);
    } catch (error) {
      onError?.(error);
    } finally {
      setSaving(false);
    }
  };

  const element = card ? (
    <ComponentCheckScreen
      component={card}
      photoRequired={reconcilePhotoRequired}
      saving={saving}
      onSave={save}
      onClose={() => setCard(null)}
    />
  ) : null;

  return { open: setCard, element };
}
