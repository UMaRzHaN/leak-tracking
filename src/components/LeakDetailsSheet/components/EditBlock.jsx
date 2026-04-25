import { useMemo } from "react";
import EditTextField from "../../EditTextField/EditTextField";
import EditPhotoRow from "./EditPhotoRow";
import s from "../LeakDetailsSheet.module.scss";

export default function EditBlock(props) {
  const {
    localEdit,
    setLocalEdit,
    activeTab,
    projectConfig,
    srcBefore,
    srcAfter,
    onEditBefore,
    onEditAfter,
    showAfter,
  } = props;
  const allFields = useMemo(() => {
    return (projectConfig.system.fields ?? [])
      .filter((f) => f.editable !== false)
      .sort((a, b) => (a.editOrder ?? 999) - (b.editOrder ?? 999));
  }, [projectConfig]);

  /* ── Field categories ── */
  const textFields  = useMemo(() => allFields.filter((f) => !f.numeric && !f.multiline),           [allFields]);
  const coordFields = useMemo(() => allFields.filter((f) =>  f.coord),                             [allFields]);
  const multiFields = useMemo(() => allFields.filter((f) => !f.numeric && f.multiline),            [allFields]);
  const paramFields = useMemo(() => allFields.filter((f) =>  f.numeric && !f.coord),               [allFields]);

  const set = (key, val) =>
    setLocalEdit((prev) => ({ ...prev, [key]: val }));

  /* ══════════════════════════════════════════
     ОСНОВНОЕ TAB — text + coords + multiline
     ══════════════════════════════════════════ */
  if (activeTab === "info") {
    const hasText  = textFields.length > 0;
    const hasMulti = multiFields.length > 0;

    return (
      <div className={s.tabPane}>

        {/* ── Text fields ── */}
        {hasText && (
          <div className={s.editSection}>
            {textFields.map(({ key, label }) => (
              <EditTextField
                key={key}
                label={label}
                value={localEdit[key] ?? ""}
                onChange={(v) => set(key, v)}
              />
            ))}
          </div>
        )}

        {/* ── Multiline fields ── */}
        {hasMulti && (
          <div className={s.editSection}>
            {multiFields.map(({ key, label }) => (
              <EditTextField
                key={key}
                label={label}
                multiline
                value={localEdit[key] ?? ""}
                onChange={(v) => set(key, v)}
              />
            ))}
          </div>
        )}

        {!hasText && !hasMulti && (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📋</span>
            <p>Нет полей для редактирования</p>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════
     КООРДИНАТЫ TAB
     ══════════════════════════════════════════ */
  if (activeTab === "photo") {
    return (
      <div className={s.tabPane}>
        <EditPhotoRow
          srcBefore={srcBefore}
          srcAfter={srcAfter}
          showAfter={showAfter}
          onEditBefore={onEditBefore}
          onEditAfter={onEditAfter}
        />
      </div>
    );
  }

  if (false && activeTab === "__photo_legacy") {
    return (
      <div className={s.tabPane}>
        <div className={s.tabEmpty}>
          <span className={s.tabEmptyIcon}>📷</span>
          <p>Фото редактируются сверху</p>
        </div>
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
                  label={label}
                  value={localEdit[key] ?? ""}
                  numeric
                  compact
                  onChange={(v) => set(key, v)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📍</span>
            <p>Нет полей координат</p>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════
     ПАРАМЕТРЫ TAB — numeric fields grid
     ══════════════════════════════════════════ */
  if (activeTab === "params") {
    return (
      <div className={s.tabPane}>
        {paramFields.length > 0 ? (
          <div className={s.editParamsGrid}>
            {paramFields.map(({ key, label }) => (
              <EditTextField
                key={key}
                label={label}
                numeric
                compact
                value={localEdit[key] ?? ""}
                onChange={(v) => set(key, v)}
              />
            ))}
          </div>
        ) : (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📊</span>
            <p>Нет числовых параметров</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}
