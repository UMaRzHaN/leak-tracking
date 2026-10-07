import { useState } from "react";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { recordComponentEdited } from "@/domain/componentHistory";
import { withStoredPhoto } from "./componentPhoto";
import ComponentDetailsSheet from "./ComponentDetailsSheet";

/**
 * Карточка компонента целиком — свайпом вправо в базе компонентов и в
 * «Сверке», как карточка утечки в базе и в обходе. Правка и удаление те же
 * на обоих экранах.
 *
 * @param {{
 *   fields?: { all?: any[] }|null,
 *   canEdit?: boolean,
 *   userProfile?: { name?: string }|null,
 *   updateComponent: (id: string, card: any) => Promise<any>,
 *   removeComponent: (id: string) => Promise<any>,
 * }} options
 */
export function useComponentDetails({
  fields,
  canEdit = true,
  userProfile,
  updateComponent,
  removeComponent,
}) {
  const { savePhoto } = usePhotoStorage();
  const [viewing, setViewing] = useState(/** @type {any} */ (null));

  const save = async (form, { changes = [] } = {}) => {
    const target = viewing;
    if (!target?.id) return;
    const card = await withStoredPhoto(
      { ...form, id: target.id },
      target.id,
      savePhoto,
    );
    const recorded = recordComponentEdited(
      target,
      { ...target, ...card },
      {
        user: userProfile?.name,
        fields: fields?.all ?? [],
        extraChanges: changes,
      },
    );
    await updateComponent(target.id, recorded);
    // Лист остаётся открытым и показывает сохранённое — вместе с только что
    // дописанной строкой истории: правка редко бывает одна, а закрытие
    // отправляло бы искать ту же карточку заново.
    setViewing(recorded);
  };

  const element = viewing ? (
    <ComponentDetailsSheet
      component={viewing}
      // Целиком, а не только видимые: подписи в истории берутся отсюда, и
      // поле, скрытое из карточки, всё равно должно называться по-русски.
      fields={/** @type {any} */ (fields?.all ?? [])}
      canEdit={canEdit}
      onSave={save}
      onRemove={async (card) => {
        setViewing(null);
        await removeComponent(card.id);
      }}
      onClose={() => setViewing(null)}
    />
  ) : null;

  return { open: setViewing, element };
}
