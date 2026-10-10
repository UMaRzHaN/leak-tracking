import { useId, useMemo, useState } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import { useModalDialog } from "@/hooks/useModalDialog";
import Icon from "@/components/ui/Icon/Icon";
import {
  leaksInPlace,
  placeLabel,
  samePlace,
  sliceField,
  sliceValues,
} from "@/domain/surveyGroups";
import SliceScreen from "./SliceScreen";
import SurveyPlaceRow from "./SurveyPlaceRow";
import s from "./Coverage.module.scss";

const num = (value) => Math.max(0, Math.round(Number(value) || 0));

/**
 * Ввод «Обследовано» (4a): по каждой группе — сколько осмотрено и сколько
 * всего (оценка). Раскрыта одна группа со степпером, остальные свёрнуты в
 * строку «32 из ~90» с «Изменить». Разрез меняется на своём экране (4c).
 *
 * Место группы берётся из выбора в шапке: заведённая там группа считается в
 * охвате этого места. Группу без места можно привязать к выбранному месту, а
 * привязанную — вернуть на весь проект.
 */
export default function SurveyScreen({
  survey,
  leaks,
  levelKeys,
  placePath = /** @type {string[]|null} */ ([]),
  onSave,
  onClose,
}) {
  const { t } = useLanguage();
  const titleId = useId();
  const dialogRef = useModalDialog({ onClose });
  const [slice, setSlice] = useState(survey.slice);
  const [groups, setGroups] = useState(survey.groups);
  const [openId, setOpenId] = useState(survey.groups[0]?.id ?? null);
  const [adding, setAdding] = useState("");
  const [sliceOpen, setSliceOpen] = useState(false);
  // Несколько папок разом (null) — не одно место: группы идут на весь проект.
  const here = placePath?.length ? placePath : null;

  const suggestions = useMemo(() => {
    const taken = new Set(
      groups
        .filter((group) => samePlace(group.place, here ?? []))
        .map((group) => group.name.toLocaleLowerCase()),
    );
    return sliceValues(
      leaksInPlace(leaks, here, levelKeys),
      sliceField(slice, levelKeys),
    ).filter((value) => !taken.has(value.toLocaleLowerCase()));
  }, [groups, leaks, slice, levelKeys, here]);
  // Подсказки — чипами под полем, а не системным datalist: на Android он
  // рисуется светлым списком под клавиатурой, а на пустом поле не виден вовсе.
  const shownSuggestions = useMemo(() => {
    const needle = adding.trim().toLocaleLowerCase();
    return needle
      ? suggestions.filter((value) =>
          value.toLocaleLowerCase().includes(needle),
        )
      : suggestions;
  }, [adding, suggestions]);
  const total = groups.reduce((sum, group) => sum + group.checked, 0);

  const patch = (id, change) =>
    setGroups((current) =>
      current.map((group) =>
        group.id === id ? { ...group, ...change } : group,
      ),
    );
  const add = (name) => {
    const clean = name.trim();
    if (!clean) return;
    const id = `g-${Date.now().toString(36)}-${groups.length}`;
    setGroups((current) => [
      ...current,
      {
        id,
        name: clean,
        checked: 0,
        estimate: 0,
        ...(here ? { place: here } : {}),
      },
    ]);
    setOpenId(id);
    setAdding("");
  };

  if (sliceOpen) {
    return (
      <SliceScreen
        value={slice}
        leaks={leaks}
        levelKeys={levelKeys}
        onBack={() => setSliceOpen(false)}
        onApply={(next) => {
          // Другой разрез — другие группы: прежние числа к нему не относятся.
          if (next !== slice) {
            setGroups([]);
            setOpenId(null);
          }
          setSlice(next);
          setSliceOpen(false);
        }}
      />
    );
  }

  return (
    <div
      ref={dialogRef}
      className={s.screen}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <header className={s.screenHeader}>
        <button
          type="button"
          className={s.back}
          onClick={onClose}
          aria-label={t("leakDetails.back")}
        >
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
        </button>
        <h1 id={titleId}>{t("coverage.surveyTitle")}</h1>
      </header>

      <div className={s.screenBody}>
        <button
          type="button"
          className={s.sliceRow}
          onClick={() => setSliceOpen(true)}
        >
          <Icon name="filter" size={18} strokeWidth={1.8} />
          <span>
            {t("coverage.slice")}:{" "}
            <strong>{t(`coverage.slices.${slice}.title`)}</strong>
          </span>
          <Icon name="chevronRight" size={16} strokeWidth={2} />
        </button>

        <div className={s.sectionHead}>
          <strong>{t(`coverage.checkedBy.${slice}`)}</strong>
          <span>{t("coverage.totalIsEstimate")}</span>
        </div>
        {here && (
          <p className={s.hint}>
            {t("coverage.newInPlace", { place: placeLabel(here) })}
          </p>
        )}

        {groups.map((group) =>
          group.id === openId ? (
            <div key={group.id} className={s.groupEdit}>
              <div className={s.groupHead}>
                <strong>{group.name}</strong>
                <label className={s.estimate}>
                  <span>{t("coverage.of")}</span>
                  <input
                    inputMode="numeric"
                    aria-label={t("coverage.estimateLabel", {
                      name: group.name,
                    })}
                    value={group.estimate ? `~${group.estimate}` : ""}
                    placeholder="~0"
                    onChange={(event) =>
                      patch(group.id, {
                        estimate: num(event.target.value.replace("~", "")),
                      })
                    }
                  />
                </label>
              </div>
              <div className={s.stepper}>
                <button
                  type="button"
                  aria-label={t("coverage.less")}
                  onClick={() =>
                    patch(group.id, { checked: Math.max(0, group.checked - 1) })
                  }
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  aria-label={t("coverage.checkedLabel", { name: group.name })}
                  value={String(group.checked)}
                  onChange={(event) =>
                    patch(group.id, { checked: num(event.target.value) })
                  }
                />
                <button
                  type="button"
                  className={s.plus}
                  aria-label={t("coverage.more")}
                  onClick={() =>
                    patch(group.id, { checked: group.checked + 1 })
                  }
                >
                  +
                </button>
              </div>
              <SurveyPlaceRow
                place={group.place}
                here={here}
                onChange={(place) => patch(group.id, { place })}
              />
            </div>
          ) : (
            <div key={group.id} className={s.groupCollapsed}>
              <span>
                <strong>{group.name}</strong>
                <small>
                  {group.checked} {t("coverage.of")} ~{group.estimate}
                  {group.place && ` · ${placeLabel(group.place)}`}
                </small>
              </span>
              <button type="button" onClick={() => setOpenId(group.id)}>
                {t("coverage.edit")}
              </button>
            </div>
          ),
        )}

        <div className={s.addGroup}>
          <Icon name="plus" size={20} strokeWidth={2} />
          <input
            value={adding}
            placeholder={t("coverage.addGroup")}
            aria-label={t("coverage.addGroup")}
            onChange={(event) => setAdding(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add(adding);
            }}
          />
          {adding.trim() && (
            <button type="button" onClick={() => add(adding)}>
              {t("coverage.add")}
            </button>
          )}
        </div>
        {shownSuggestions.length > 0 && (
          <div
            className={s.suggestions}
            role="group"
            aria-label={t("coverage.suggestions")}
          >
            {shownSuggestions.map((value) => (
              <button key={value} type="button" onClick={() => add(value)}>
                <Icon name="plus" size={14} strokeWidth={2.2} />
                {value}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className={s.footer}>
        <p className={s.totalRow}>
          <span>{t("coverage.totalChecked")}</span>
          <strong>{t("coverage.objects", { count: total })}</strong>
        </p>
        <button
          type="button"
          className={s.primary}
          onClick={() => onSave({ slice, groups })}
        >
          {t("coverage.save")}
        </button>
      </footer>
    </div>
  );
}
