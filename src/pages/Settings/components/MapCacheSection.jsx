import { OFFLINE_MAP_ONLY, TILE_PROVIDER_ORIGIN } from "@/configs/mapTiles";
import { useLanguage } from "@/app/hooks/useLanguage";
import { formatStorageAmount } from "@/services/storage/deviceStorage";
import { useDeviceStorage } from "../hooks/useDeviceStorage";
import s from "../Settings.module.scss";

export default function MapCacheSection({ cacheInfo, localeTexts, onClear }) {
  const { t } = useLanguage();
  // Объём кэша карт показывали, а место, из которого он берётся, — нет.
  const deviceStorage = useDeviceStorage();
  const freeSpace = formatStorageAmount(deviceStorage?.freeBytes ?? null);

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
                ? t("settings.tileCacheSummary", {
                    count: cacheInfo.count,
                    sizeMB: cacheInfo.sizeMB,
                  })
                : localeTexts.cacheEmpty}
            </span>
          ) : (
            <span className={s.cacheSize}>{localeTexts.loading}</span>
          )}
        </div>
        <div className={s.cacheInfo}>
          <span className={s.cacheLabel}>{t("settings.deviceStorage")}</span>
          <span className={s.cacheSize}>
            {deviceStorage === null
              ? localeTexts.loading
              : freeSpace
                ? t("settings.deviceStorageFree", {
                    value: freeSpace.value,
                    unit: t(`settings.storageUnit.${freeSpace.unit}`),
                  })
                : t("settings.deviceStorageUnknown")}
          </span>
        </div>
        <div className={s.cacheInfo}>
          <span className={s.cacheLabel}>{t("settings.mapProvider")}</span>
          <span className={s.cacheSize}>
            {OFFLINE_MAP_ONLY
              ? t("settings.mapProviderLocalOnly")
              : TILE_PROVIDER_ORIGIN || t("settings.mapProviderUnknown")}
          </span>
          {!OFFLINE_MAP_ONLY && TILE_PROVIDER_ORIGIN && (
            <span className={s.cacheSize} role="note">
              {t("settings.mapProviderPrivacyHint")}
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
