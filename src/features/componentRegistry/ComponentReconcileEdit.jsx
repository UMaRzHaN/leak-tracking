import { useLanguage } from "@/app/hooks/useLanguage";
import EditTextField from "@/features/editTextField/EditTextField";
import { component_statuses } from "@/data/component/componentDictionary";
import { reconcileEntries } from "@/domain/componentReconcileEdits";
import { fmtDate } from "@/features/leakDetails/components/viewBlockUtils";
import sheet from "@/features/leakDetails/LeakDetailsSheet.module.scss";
import s from "@/features/leakDetails/components/RecordEditList.module.scss";

/**
 * Правка записанных сверок в режиме правки карточки компонента: состояние,
 * в котором нашли железо, и замечание. Черновик — по ключу записи; сохраняет
 * его общая кнопка листа вместе с правками полей.
 */
export default function ComponentReconcileEdit({ component, edits, setEdits }) {
  const { t, lang } = useLanguage();
  const entries = reconcileEntries(component);

  if (entries.length === 0) {
    return (
      <div className={sheet.tabPane}>
        <div className={sheet.tabEmpty}>
          <p>{t("components.reconcileLog.empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={sheet.tabPane}>
      {entries.map(({ entry, key }) => {
        const draft = edits[key] ?? {};
        const value = (field) => (field in draft ? draft[field] : entry[field]);
        const set = (field, next) =>
          setEdits((previous) => ({
            ...previous,
            [key]: { ...previous[key], [field]: next },
          }));
        const state = String(value("to") ?? "");
        // Записанное состояние может быть не из словаря — оно остаётся в
        // списке, иначе выбор молча подменил бы его первым пунктом.
        const statuses =
          state && !component_statuses.includes(state)
            ? [state, ...component_statuses]
            : component_statuses;
        const title = Number.isFinite(entry.roundNumber)
          ? t("components.reconcileLog.round", { number: entry.roundNumber })
          : t("components.reconcileLog.inspection");

        return (
          <section key={key} className={s.record}>
            <header className={s.head}>
              <time dateTime={entry.date}>{fmtDate(entry.date, lang)}</time>
              <span className={s.badge}>{title}</span>
            </header>

            <label className={s.choice}>
              <span className={s.choiceLabel}>
                {t("components.reconcileLog.state")}
              </span>
              <select
                className={s.select}
                value={state}
                onChange={(event) => set("to", event.target.value)}
              >
                {!state && <option value="" />}
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <div className={s.fields}>
              <EditTextField
                label={t("components.reconcileLog.comment")}
                multiline
                value={value("comment") ?? ""}
                onChange={(next) => set("comment", next)}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
