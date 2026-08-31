import FieldVisibilityModal from "@/features/fieldVisibility/FieldVisibilityModal";
import { useLanguage } from "@/app/hooks/useLanguage";

/**
 * Окно выбора полей формы утечки.
 *
 * Пара к `ComponentFieldsModal`: два окна об одном и том же, и держать одно
 * компонентом, а другое строками в `Settings` значило бы, что при следующей
 * правке они разойдутся.
 */
export default function LeakFieldsModal({
  open,
  onClose,
  config,
  hiddenFields,
  setHiddenFields,
  localeTexts,
  notify,
}) {
  const { t } = useLanguage();

  return (
    <FieldVisibilityModal
      open={open}
      onClose={onClose}
      config={config}
      hiddenFields={hiddenFields}
      onSave={(next) => {
        setHiddenFields(next);
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
