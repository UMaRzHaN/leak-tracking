import { useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import EditTextField from "@/features/editTextField/EditTextField";
import SettingsModal from "@/features/settings/SettingsModal/SettingsModal";
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
  const [calcSettingsOpen, setCalcSettingsOpen] = useState(false);
  const {
    localEdit,
    setLocalEdit,
    localCalcParams,
    setLocalCalcParams,
    activeTab,
    projectConfig,
    srcBefore,
    srcAfter,
    srcRepair,
    onEditBefore,
    onPickBefore,
    onEditAfter,
    onPickAfter,
    onEditRepair,
    onPickRepair,
    isNative,
    showAfter,
    showRepair,
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
          srcRepair={srcRepair}
          showAfter={showAfter}
          showRepair={showRepair}
          onEditBefore={onEditBefore}
          onPickBefore={onPickBefore}
          onEditAfter={onEditAfter}
          onPickAfter={onPickAfter}
          onEditRepair={onEditRepair}
          onPickRepair={onPickRepair}
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

        <div className={s.calcShortcut}>
          <div className={s.calcShortcutText}>
            <strong>
              {lang === "ru" ? "Параметры расчёта" : "Calculation parameters"}
            </strong>
            <span>
              {lang === "ru"
                ? "Используются при сохранении этой утечки"
                : "Used when this leak is saved"}
            </span>
          </div>
          <button type="button" onClick={() => setCalcSettingsOpen(true)}>
            {lang === "ru" ? "Редактировать параметры" : "Edit parameters"}
          </button>
        </div>

        <SettingsModal
          open={calcSettingsOpen}
          onClose={() => setCalcSettingsOpen(false)}
          variables={localCalcParams}
          onSave={setLocalCalcParams}
        />
      </div>
    );
  }

  return null;
}
