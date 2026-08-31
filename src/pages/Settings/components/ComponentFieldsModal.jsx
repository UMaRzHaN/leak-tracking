import FieldVisibilityModal from "@/features/fieldVisibility/FieldVisibilityModal";
import { useLanguage } from "@/app/hooks/useLanguage";

/**
 * Окно выбора полей карточки компонента.
 *
 * Само по себе, а не строками в `Settings`: у него своя конфигурация реестра,
 * и грузится она лениво — проекту без реестра платить за неё незачем. Колонку
 * в блоке «поля и Excel» рисует раздел, окно открывается его кнопкой.
 */
export default function ComponentFieldsModal({
  open,
  onClose,
  fields,
  localeTexts,
  notify,
}) {
  const { t } = useLanguage();

  return (
    <FieldVisibilityModal
      open={open}
      onClose={onClose}
      config={fields.config}
      hiddenFields={fields.hiddenFields}
      onSave={(next) => {
        fields.setHiddenFields(next);
        onClose();
        notify(
          "success",
          next.size > 0
            ? t("settings.notifications.hiddenFieldsCount", {
                count: next.size,
              })
            : localeTexts.notifications.allFieldsActive,
        );
      }}
    />
  );
}
