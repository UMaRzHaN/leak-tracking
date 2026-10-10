import { useLanguage } from "@/app/hooks/useLanguage";
import SchemaList from "@/features/schemas/SchemaList";
import s from "@/pages/ComponentRegistry/ComponentRegistry.module.scss";

/**
 * «Реестр» инвентаризации: чертежи проекта. Само железо живёт в «Базе», так
 * что здесь только схемы — их смотрят по ходу заполнения карточки.
 */
export default function SchemasPage({ project }) {
  const { t } = useLanguage();
  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1>{t("schemas.tab")}</h1>
      </header>
      <SchemaList project={project} />
    </div>
  );
}
