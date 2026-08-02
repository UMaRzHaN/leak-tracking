import { OFFLINE_MAP_ONLY, TILE_PROVIDER_ORIGIN } from "@/configs/mapTiles";
import s from "../Settings.module.scss";

export default function MapCacheSection({
  cacheInfo,
  lang,
  localeTexts,
  onClear,
}) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <h2 className={s.sectionTitle}>{localeTexts.mapCache}</h2>
      </div>
      <div className={s.cacheBody}>
        <div className={s.cacheInfo}>
          <span className={s.cacheLabel}>{localeTexts.satelliteTiles}</span>
          {cacheInfo ? (
            <span className={s.cacheSize}>
              {cacheInfo.count > 0
                ? lang === "ru"
                  ? `${cacheInfo.count} тайлов · ~${cacheInfo.sizeMB} МБ`
                  : `${cacheInfo.count} tiles · ~${cacheInfo.sizeMB} MB`
                : localeTexts.cacheEmpty}
            </span>
          ) : (
            <span className={s.cacheSize}>{localeTexts.loading}</span>
          )}
        </div>
        <div className={s.cacheInfo}>
          <span className={s.cacheLabel}>
            {lang === "ru" ? "Источник карты" : "Map provider"}
          </span>
          <span className={s.cacheSize}>
            {OFFLINE_MAP_ONLY
              ? lang === "ru"
                ? "Только локальный кэш — внешние запросы отключены"
                : "Local cache only — external requests disabled"
              : TILE_PROVIDER_ORIGIN ||
                (lang === "ru" ? "Не определён" : "Not configured")}
          </span>
          {!OFFLINE_MAP_ONLY && TILE_PROVIDER_ORIGIN && (
            <span className={s.cacheSize} role="note">
              {lang === "ru"
                ? "Провайдер получает координаты запрашиваемых тайлов. Для чувствительных объектов используйте корпоративный сервер."
                : "The provider receives requested tile coordinates. Use a corporate server for sensitive sites."}
            </span>
          )}
        </div>
        <button
          className={s.cacheBtn}
          type="button"
          onClick={onClear}
          disabled={!cacheInfo || cacheInfo.count === 0}
        >
          {localeTexts.clearMapCache}
        </button>
      </div>
    </section>
  );
}
