import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import EditTextField from "@/features/editTextField/EditTextField";
import EditPhotoRow from "./EditPhotoRow";
import s from "@/features/leakDetails/LeakDetailsSheet.module.scss";

function translateFieldLabel(key, fallbackLabel, t, lang) {
  const explicitLabels = {
    date: lang === "ru" ? "Дата" : "Date",
    lat: lang === "ru" ? "Широта (X)" : "Latitude (X)",
    lng: lang === "ru" ? "Долгота (Y)" : "Longitude (Y)",
  };

  return t(`addLeak.fields.${key}.label`, {
    defaultValue: explicitLabels[key] ?? fallbackLabel,
  });
}

export default function EditBlock(props) {
  const { lang, t } = useLanguage();
  const {
    localEdit,
    setLocalEdit,
    activeTab,
    projectConfig,
    srcBefore,
    srcAfter,
    onEditBefore,
    onPickBefore,
    onEditAfter,
    onPickAfter,
    isNative,
    showAfter,
  } = props;

  const allFields = useMemo(() => {
    return (projectConfig.system.fields ?? [])
      .filter((field) => field.editable !== false)
      .sort(
        (left, right) => (left.editOrder ?? 999) - (right.editOrder ?? 999),
      );
  }, [projectConfig]);

  const textFields = useMemo(
    () => allFields.filter((field) => !field.numeric && !field.multiline),
    [allFields],
  );
  const coordFields = useMemo(
    () => allFields.filter((field) => field.coord),
    [allFields],
  );
  const multiFields = useMemo(
    () => allFields.filter((field) => !field.numeric && field.multiline),
    [allFields],
  );
  const paramFields = useMemo(
    () => allFields.filter((field) => field.numeric && !field.coord),
    [allFields],
  );

  const setField = (key, value) =>
    setLocalEdit((prev) => ({ ...prev, [key]: value }));

  if (activeTab === "info") {
    const hasText = textFields.length > 0;
    const hasMulti = multiFields.length > 0;

    return (
      <div className={s.tabPane}>
        {hasText && (
          <div className={s.editSection}>
            {textFields.map(({ key, label }) => (
              <EditTextField
                key={key}
                label={translateFieldLabel(key, label, t, lang)}
                value={localEdit[key] ?? ""}
                onChange={(value) => setField(key, value)}
              />
            ))}
          </div>
        )}

        {hasMulti && (
          <div className={s.editSection}>
            {multiFields.map(({ key, label }) => (
              <EditTextField
                key={key}
                label={translateFieldLabel(key, label, t, lang)}
                multiline
                value={localEdit[key] ?? ""}
                onChange={(value) => setField(key, value)}
              />
            ))}
          </div>
        )}

        {!hasText && !hasMulti && (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📋</span>
            <p>
              {lang === "ru"
                ? "Нет полей для редактирования"
                : "No editable fields"}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "photo") {
    return (
      <div className={s.tabPane}>
        <EditPhotoRow
          srcBefore={srcBefore}
          srcAfter={srcAfter}
          showAfter={showAfter}
          onEditBefore={onEditBefore}
          onPickBefore={onPickBefore}
          onEditAfter={onEditAfter}
          onPickAfter={onPickAfter}
          isNative={isNative}
        />
      </div>
    );
  }

  if (activeTab === "coords") {
    return (
      <div className={s.tabPane}>
        {coordFields.length > 0 ? (
          <div className={s.coordGroup}>
            <div className={s.coordPair}>
              {coordFields.map(({ key, label }) => (
                <EditTextField
                  key={key}
                  label={translateFieldLabel(key, label, t, lang)}
                  value={localEdit[key] ?? ""}
                  numeric
                  compact
                  onChange={(value) => setField(key, value)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📍</span>
            <p>
              {lang === "ru" ? "Нет полей координат" : "No coordinate fields"}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "params") {
    return (
      <div className={s.tabPane}>
        {paramFields.length > 0 ? (
          <div className={s.editParamsGrid}>
            {paramFields.map(({ key, label }) => (
              <EditTextField
                key={key}
                label={translateFieldLabel(key, label, t, lang)}
                numeric
                compact
                value={localEdit[key] ?? ""}
                onChange={(value) => setField(key, value)}
              />
            ))}
          </div>
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📊</span>
            <p>
              {lang === "ru"
                ? "Нет числовых параметров"
                : "No numeric parameters"}
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
