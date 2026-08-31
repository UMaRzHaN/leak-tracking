import { useState } from "react";
import FieldVisibilityModal from "@/features/fieldVisibility/FieldVisibilityModal";
import FieldVisibilitySection from "./FieldVisibilitySection";
import { useComponentFieldVisibility } from "../hooks/useComponentFieldVisibility";
import { useLanguage } from "@/app/hooks/useLanguage";

/**
 * «Скрыть поля» для карточки компонента.
 *
 * Отдельным куском, а не строками в `Settings`: раздел есть только у проектов
 * с реестром, он держит своё окно и свою конфигурацию, и всё это ничего не
 * должно значить для остальных настроек.
 *
 * Раздел и окно — те же, что у полей утечки. Разные здесь только список
 * скрытого и подписи: поля у двух сущностей называются одинаково, и общий
 * список скрывал бы поле разом на обоих экранах.
 */
export default function ComponentFieldsSection({
  activeProject,
  localeTexts,
  notify,
}) {
  const { t } = useLanguage();
  const { available, config, hiddenFields, setHiddenFields } =
    useComponentFieldVisibility(activeProject);
  const [open, setOpen] = useState(false);

  if (!available) return null;

  return (
    <>
      <FieldVisibilitySection
        activeProject={activeProject}
        hiddenFields={hiddenFields}
        localeTexts={localeTexts}
        title={t("settings.componentFieldsAndExcel")}
        description={t("settings.componentFieldsDescription")}
        onConfigure={() => setOpen(true)}
      />
      <FieldVisibilityModal
        open={open}
        onClose={() => setOpen(false)}
        config={config}
        hiddenFields={hiddenFields}
        onSave={(next) => {
          setHiddenFields(next);
          setOpen(false);
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
    </>
  );
}
