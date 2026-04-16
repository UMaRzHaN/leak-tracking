import { useMemo } from "react";
import EditTextField from "../../EditTextField/EditTextField";
import s from "../LeakDetailsSheet.module.scss";

function splitFields(fields) {
  return {
    text:    fields.filter((f) => !f.numeric && !f.multiline),
    numeric: fields.filter((f) =>  f.numeric),
    multi:   fields.filter((f) => !f.numeric && f.multiline),
  };
}

export default function EditBlock({ localEdit, setLocalEdit, activeTab, projectConfig }) {
  const fields = useMemo(() => {
    const all = projectConfig.system.fields ?? [];
    return all
      .filter((f) => f.editable !== false)
      .sort((a, b) => (a.editOrder ?? 999) - (b.editOrder ?? 999));
  }, [projectConfig]);

  const { text, numeric, multi } = useMemo(() => splitFields(fields), [fields]);

  const onChange = (key, val) =>
    setLocalEdit((prev) => ({ ...prev, [key]: val }));

  if (activeTab === "info") {
    const infoFields = [...text, ...multi];
    return (
      <div className={s.tabPane}>
        {infoFields.map(({ key, label, multiline }) => (
          <EditTextField
            key={key}
            label={label}
            multiline={multiline}
            value={localEdit[key] ?? ""}
            onChange={(v) => onChange(key, v)}
          />
        ))}
      </div>
    );
  }

  if (activeTab === "params") {
    return (
      <div className={s.tabPane}>
        <div className={s.editParamsGrid}>
          {numeric.map(({ key, label }) => (
            <EditTextField
              key={key}
              label={label}
              numeric
              value={localEdit[key] ?? ""}
              onChange={(v) => onChange(key, v)}
            />
          ))}
        </div>
        {numeric.length === 0 && (
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
