import { useLanguage } from "@/app/hooks/useLanguage";
import Icon from "@/components/ui/Icon/Icon";
import s from "../MapPage.module.scss";

/**
 * Выгрузка карты в KML. Число на кнопке — сколько точек уйдёт в файл: ровно
 * те, что на карте сейчас, с отборами и поиском.
 */
export default function MapExportButton({ count, onExport }) {
  const { t } = useLanguage();
  return (
    <div className={s.exportGroup}>
      <button
        type="button"
        className={s.exportBtn}
        onClick={onExport}
        aria-label={t("map.kml.exportLabel", { count })}
      >
        <Icon name="share" size={14} />
        KML
        <span className={s.exportCount}>{count}</span>
      </button>
    </div>
  );
}
