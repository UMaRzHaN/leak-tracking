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
