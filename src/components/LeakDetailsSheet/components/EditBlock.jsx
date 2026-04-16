import { useMemo } from "react";
import EditTextField from "../../EditTextField/EditTextField";
import s from "../LeakDetailsSheet.module.scss";

export default function EditBlock({ localEdit, setLocalEdit, activeTab, projectConfig }) {
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
    const hasText   = textFields.length > 0;
    const hasCoord  = coordFields.length > 0;
    const hasMulti  = multiFields.length > 0;

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

        {/* ── Coordinate pair ── */}
        {hasCoord && (
          <div className={s.coordGroup}>
            <span className={s.coordGroupLabel}>Координаты</span>
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

        {!hasText && !hasCoord && !hasMulti && (
          <div className={s.tabEmpty}>
            <span className={s.tabEmptyIcon}>📋</span>
            <p>Нет полей для редактирования</p>
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
