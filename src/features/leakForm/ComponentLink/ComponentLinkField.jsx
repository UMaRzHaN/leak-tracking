import { Suspense, lazy, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import {
  describeLinkedComponent,
  isLinkedToComponent,
} from "@/domain/leakComponentLink";
import s from "./ComponentLinkField.module.scss";

/*
 * Лист выбора грузится по нажатию, а не вместе с формой.
 *
 * Форма утечки лежит в стартовом графе, а лист тянет за собой
 * `ComponentRepository` и мост Capacitor. Запас до предела сборки — около трёх
 * килобайт, поэтому цена статического импорта здесь — упавший CI.
 */
const ComponentPickerSheet = lazy(() => import("./ComponentPickerSheet"));

/**
 * Привязка утечки к заведённой карточке компонента.
 *
 * Поле не обязательное и ничего не заменяет: наименование по-прежнему можно
 * просто напечатать. Реестр ведут не на каждом объекте, а обход утечек
 * начинают раньше, чем заканчивают обход железа, — утечка, которой не к чему
 * привязаться, должна записываться так же легко, как и раньше.
 */
export default function ComponentLinkField({
  form,
  project,
  coords = null,
  onPick,
  onUnlink,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const linked = isLinkedToComponent(form);

  return (
    <div className={s.field}>
      <span className={s.label}>{t("leakForm.componentLink.title")}</span>

      {linked && (
        <div className={s.linked}>
          <span className={s.value}>{describeLinkedComponent(form)}</span>
          <button type="button" className={s.unlink} onClick={onUnlink}>
            {t("leakForm.componentLink.unlink")}
          </button>
        </div>
      )}

      <button
        type="button"
        className={s.pick}
        onClick={() => setOpen(true)}
        disabled={!project?.id}
      >
        {linked
          ? t("leakForm.componentLink.change")
          : t("leakForm.componentLink.pick")}
      </button>

      {open && (
        <Suspense fallback={null}>
          <ComponentPickerSheet
            project={project}
            coords={coords}
            onPick={(component) => {
              onPick(component);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
